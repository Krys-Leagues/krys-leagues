begin;

-- Monthlies-only additive migration. This file is intentionally not executed
-- by the source-repair preparation task. Blank/unplayed source slots stay in local evidence files and are not score rows.
alter table public.historical_monthly_score_observations
  add column if not exists played_state text,
  add column if not exists source_score_text text,
  add column if not exists logical_observation_key text,
  add column if not exists source_provenance jsonb not null default '[]'::jsonb;

update public.historical_monthly_score_observations
set played_state = 'PLAYED'
where played_state is null;

update public.historical_monthly_score_observations
set source_score_text = score::text
where source_score_text is null and score is not null;

alter table public.historical_monthly_score_observations
  alter column played_state set default 'PLAYED',
  alter column played_state set not null,
  alter column score set not null;

do $historical_monthly_repaired_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'historical_monthly_score_played_state_check'
      and conrelid = 'public.historical_monthly_score_observations'::regclass
  ) then
    alter table public.historical_monthly_score_observations
      add constraint historical_monthly_score_played_state_check
      check (
        played_state = 'PLAYED' and score is not null
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'historical_monthly_source_provenance_array_check'
      and conrelid = 'public.historical_monthly_score_observations'::regclass
  ) then
    alter table public.historical_monthly_score_observations
      add constraint historical_monthly_source_provenance_array_check
      check (jsonb_typeof(source_provenance) = 'array');
  end if;
end;
$historical_monthly_repaired_constraints$;

create unique index if not exists historical_monthly_logical_observation_key_uidx
  on public.historical_monthly_score_observations(logical_observation_key)
  where logical_observation_key is not null;

create index if not exists historical_monthly_played_state_idx
  on public.historical_monthly_score_observations(period_year, period_month, division, played_state);

create table if not exists public.historical_monthly_observation_provenance (
  id uuid primary key default gen_random_uuid(),
  historical_monthly_score_observation_id uuid not null references public.historical_monthly_score_observations(id) on delete cascade,
  source_kind text not null check (source_kind in ('OLD_RETAINED', 'FRESH_PUBLIC', 'ADMIN_EXPORT', 'OTHER_AUTHORITATIVE')),
  source_fingerprint text not null check (btrim(source_fingerprint) <> ''),
  source_row integer null check (source_row is null or source_row > 0),
  source_file text not null check (btrim(source_file) <> ''),
  source_url text null,
  source_score_text text null,
  played_state text not null check (played_state = 'PLAYED'),
  raw_sha256 text null check (raw_sha256 is null or raw_sha256 ~* '^[0-9a-f]{64}$'),
  raw_source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (historical_monthly_score_observation_id, source_kind, source_fingerprint)
);

create index if not exists historical_monthly_observation_provenance_source_idx
  on public.historical_monthly_observation_provenance(source_kind, source_fingerprint);

alter table public.historical_monthly_observation_provenance enable row level security;
revoke all on public.historical_monthly_observation_provenance from public, anon, authenticated;
grant select on public.historical_monthly_observation_provenance to authenticated;

drop policy if exists "Site admins can read historical Monthly provenance" on public.historical_monthly_observation_provenance;
create policy "Site admins can read historical Monthly provenance"
  on public.historical_monthly_observation_provenance for select to authenticated
  using (public.is_current_user_site_admin());

create or replace function public.commit_historical_monthly_preview(
  p_source_filename text,
  p_source_sha256 text,
  p_parser_version text,
  p_source_row_count integer,
  p_rows jsonb
)
returns table(historical_monthly_import_id uuid, idempotent boolean, applied_row_count integer, source_row_count integer)
language plpgsql security definer set search_path to '' as $function$
declare
  v_user uuid := auth.uid();
  v_import public.historical_monthly_imports%rowtype;
  v_row jsonb;
  v_player uuid;
  v_canonical_player uuid;
  v_count integer := 0;
  v_row_key text;
  v_logical_key text;
  v_source_row text;
  v_state text;
  v_score text;
  v_provenance jsonb;
begin
  if v_user is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  if p_source_filename is null or btrim(p_source_filename) = '' then raise exception 'Source filename is required'; end if;
  if p_source_sha256 is null or lower(btrim(p_source_sha256)) !~ '^[0-9a-f]{64}$' then raise exception 'A lowercase SHA-256 is required'; end if;
  if p_parser_version is null or btrim(p_parser_version) = '' then raise exception 'Parser version is required'; end if;
  if p_source_row_count is null or p_source_row_count <= 0 then raise exception 'A positive source row count is required'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'At least one reviewed Monthly observation is required'; end if;
  if p_source_row_count < jsonb_array_length(p_rows) then raise exception 'Applied Monthly rows cannot exceed the source row count'; end if;
  if (select count(distinct value->>'rowKey') from jsonb_array_elements(p_rows)) <> jsonb_array_length(p_rows)
     or exists (select 1 from jsonb_array_elements(p_rows) where coalesce(value->>'rowKey', '') = '') then
    raise exception 'Monthly source payload contains duplicate or blank row keys';
  end if;
  if (select count(distinct value->>'logicalKey') from jsonb_array_elements(p_rows)) <> jsonb_array_length(p_rows)
     or exists (select 1 from jsonb_array_elements(p_rows) where coalesce(value->>'logicalKey', '') = '') then
    raise exception 'Monthly source payload contains duplicate or blank logical keys';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('historical-monthly:' || lower(btrim(p_source_sha256)), 0));
  select * into v_import from public.historical_monthly_imports where source_sha256 = lower(btrim(p_source_sha256));
  if found then
    if v_import.source_filename is distinct from btrim(p_source_filename)
       or v_import.parser_version is distinct from btrim(p_parser_version)
       or v_import.source_row_count is distinct from p_source_row_count
       or v_import.applied_row_count is distinct from jsonb_array_length(p_rows) then
      raise exception 'Monthly source SHA conflicts with existing import metadata';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_rows) incoming(value)
      where not exists (
        select 1 from public.historical_monthly_score_observations score
        where score.historical_monthly_import_id = v_import.id
          and score.source_fingerprint = incoming.value->>'rowKey'
          and score.raw_source = incoming.value
      )
    ) then raise exception 'Monthly source SHA conflicts with stored reviewed rows'; end if;
    historical_monthly_import_id := v_import.id; idempotent := true; applied_row_count := v_import.applied_row_count; source_row_count := v_import.source_row_count; return next; return;
  end if;

  insert into public.historical_monthly_imports(source_filename, source_sha256, parser_version, source_row_count, applied_row_count, committed_by)
  values (btrim(p_source_filename), lower(btrim(p_source_sha256)), btrim(p_parser_version), p_source_row_count, jsonb_array_length(p_rows), v_user)
  returning * into v_import;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_row_key := nullif(btrim(v_row->>'rowKey'), '');
    v_logical_key := nullif(btrim(v_row->>'logicalKey'), '');
    v_source_row := nullif(v_row->>'sourceRow', '');
    v_state := coalesce(nullif(v_row->>'playedState', ''), 'PLAYED');
    v_score := nullif(v_row->>'score', '');
    v_provenance := coalesce(v_row->'provenance', '[]'::jsonb);
    if v_source_row is null or v_source_row !~ '^\d+$' or v_source_row::integer <= 0 then raise exception 'Every Monthly row requires a positive source row number'; end if;
    if v_state <> 'PLAYED' then raise exception 'Monthly score payload accepts PLAYED rows only; blank/unplayed slots are evidence-only'; end if;
    if v_score is null or v_score !~ '^-?\d+$' then raise exception 'Every importable Monthly row requires a numeric score; blank/unplayed slots are evidence-only'; end if;
    if jsonb_typeof(v_provenance) <> 'array' then raise exception 'Monthly provenance must be a JSON array'; end if;
    if nullif(v_row->>'historicalName', '') is null or nullif(v_row->>'courseName', '') is null then raise exception 'Every Monthly row requires its exact historical name and course name'; end if;
    if nullif(v_row->>'year', '') is null or v_row->>'year' !~ '^\d+$' or (v_row->>'year')::integer not between 1900 and 2200 then raise exception 'Every Monthly row requires a valid period year'; end if;
    if nullif(v_row->>'month', '') is null or v_row->>'month' !~ '^\d+$' or (v_row->>'month')::integer not between 1 and 12 then raise exception 'Every Monthly row requires a valid period month'; end if;
    if v_row->>'difficulty' not in ('easy', 'hard') then raise exception 'Every Monthly row requires difficulty easy or hard'; end if;
    begin
      v_player := (v_row->>'canonicalPlayerId')::uuid;
    exception when invalid_text_representation then raise exception 'Every Monthly row requires a valid canonical Global Player UUID';
    end;
    v_canonical_player := public.resolve_canonical_player_id(v_player);
    if v_canonical_player is null or not exists(select 1 from public.players where id = v_canonical_player) then raise exception 'Selected player does not resolve to a canonical Global Player'; end if;
    if exists(select 1 from public.historical_monthly_score_observations score where score.source_fingerprint = v_row_key or score.logical_observation_key = v_logical_key) then raise exception 'Monthly row key or logical key already exists'; end if;

    insert into public.historical_monthly_score_observations(
      historical_monthly_import_id, source_fingerprint, source_row, period_year, period_month, period_id,
      division, historical_player_name, canonical_player_id, source_player_id, course_name, difficulty,
      score, source_score_text, played_state, logical_observation_key, hole_in_ones, course_placement, course_points,
      overall_placement, courses_played, total_strokes, overall_hole_in_ones, overall_points, source_url, raw_source, source_provenance
    ) values (
      v_import.id, v_row_key, v_source_row::integer, (v_row->>'year')::integer, (v_row->>'month')::integer, nullif(v_row->>'periodId', '')::integer,
      btrim(v_row->>'division'), v_row->>'historicalName', v_canonical_player, nullif(v_row->>'sourcePlayerId', ''), btrim(v_row->>'courseName'), v_row->>'difficulty',
      v_score::integer, nullif(v_row->>'scoreText', ''), 'PLAYED', v_logical_key,
      nullif(v_row->>'holeInOnes', '')::integer, nullif(v_row->>'coursePlacement', '')::integer, nullif(v_row->>'coursePoints', '')::integer,
      nullif(v_row->>'overallPlacement', '')::integer, nullif(v_row->>'coursesPlayed', '')::integer, nullif(v_row->>'totalStrokes', '')::integer,
      nullif(v_row->>'overallHn1', '')::integer, nullif(v_row->>'overallPoints', '')::integer, btrim(v_row->>'sourceUrl'), v_row, v_provenance
    );
    v_count := v_count + 1;
  end loop;

  historical_monthly_import_id := v_import.id; idempotent := false; applied_row_count := v_count; source_row_count := p_source_row_count; return next;
end;
$function$;

revoke all on function public.commit_historical_monthly_preview(text, text, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.commit_historical_monthly_preview(text, text, text, integer, jsonb) to authenticated;

commit;
