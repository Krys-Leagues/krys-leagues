begin;

do $historical_pyp_prerequisites$
begin
  if to_regclass('public.players') is null
     or to_regprocedure('public.is_current_user_site_admin()') is null
     or to_regprocedure('public.resolve_canonical_player_id(uuid)') is null then
    raise exception 'Historical PYP prerequisites are missing: players, site-admin authorization, and canonical identity must be installed first';
  end if;
end;
$historical_pyp_prerequisites$;

create table if not exists public.historical_pyp_imports (
  id uuid primary key default gen_random_uuid(),
  source_filename text not null,
  source_sha256 text not null,
  preview_fingerprint text not null,
  parser_version text not null,
  validated_preview jsonb not null,
  source_row_count integer not null,
  observation_count integer not null,
  unplayed_observation_count integer not null default 0,
  committed_at timestamptz not null default now(),
  committed_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint historical_pyp_imports_filename_nonblank check (btrim(source_filename) <> ''),
  constraint historical_pyp_imports_sha_format check (source_sha256 = lower(source_sha256) and source_sha256 ~ '^[0-9a-f]{64}$'),
  constraint historical_pyp_imports_fingerprint_nonblank check (btrim(preview_fingerprint) <> ''),
  constraint historical_pyp_imports_parser_nonblank check (btrim(parser_version) <> ''),
  constraint historical_pyp_imports_preview_object check (jsonb_typeof(validated_preview) = 'object'),
  constraint historical_pyp_imports_counts_nonnegative check (source_row_count >= 0 and observation_count >= 0 and unplayed_observation_count >= 0),
  constraint historical_pyp_imports_source_sha_key unique (source_sha256),
  constraint historical_pyp_imports_preview_fingerprint_key unique (preview_fingerprint)
);

create table if not exists public.historical_pyp_observations (
  id uuid primary key default gen_random_uuid(),
  historical_pyp_import_id uuid not null references public.historical_pyp_imports(id) on delete cascade,
  source_fingerprint text not null,
  season_number integer not null,
  division text not null,
  game_number integer not null,
  source_era text not null,
  historical_player_name text not null,
  canonical_player_id uuid not null references public.players(id) on delete restrict,
  canonical_player_name text null,
  course_1_holes_won integer null,
  course_2_holes_won integer null,
  total_holes_won integer null,
  course_1_raw text not null default '',
  course_2_raw text not null default '',
  total_raw text not null default '',
  wins integer null,
  losses integer null,
  draws integer null,
  points integer null,
  published_placement text null,
  source_state text not null,
  source_state_evidence text not null,
  source_side text not null,
  source_workbook text not null,
  source_tab text not null,
  source_row integer not null,
  source_cells text not null,
  total_cell text not null,
  wld_cells text not null,
  source_url text not null,
  source_range text not null,
  pairing_state text not null,
  opponent_historical_player_name text null,
  opponent_canonical_player_id uuid null references public.players(id) on delete restrict,
  pairing_evidence text not null,
  pairing_source_range text null,
  pairing_source_cells text null,
  pairing_source_url text null,
  created_at timestamptz not null default now(),
  constraint historical_pyp_observations_source_fingerprint_key unique (historical_pyp_import_id, source_fingerprint),
  constraint historical_pyp_observations_season check (season_number between 1 and 14),
  constraint historical_pyp_observations_division_nonblank check (btrim(division) <> ''),
  constraint historical_pyp_observations_name_nonblank check (btrim(historical_player_name) <> ''),
  constraint historical_pyp_observations_game check (game_number > 0),
  constraint historical_pyp_observations_era check (source_era in ('legacy_aggregate', 'detailed_holes_won')),
  constraint historical_pyp_observations_state check (source_state in ('PLAYED', 'UNPLAYED')),
  constraint historical_pyp_observations_pairing_state check (pairing_state in ('KNOWN', 'AMBIGUOUS', 'UNKNOWN', 'UNUSABLE')),
  constraint historical_pyp_observations_holes_won_nonnegative check (
    (course_1_holes_won is null or course_1_holes_won >= 0)
    and (course_2_holes_won is null or course_2_holes_won >= 0)
    and (total_holes_won is null or total_holes_won >= 0)
  ),
  constraint historical_pyp_observations_source_nonblank check (
    btrim(source_workbook) <> '' and btrim(source_tab) <> '' and source_row > 0
    and btrim(source_cells) <> '' and btrim(total_cell) <> '' and btrim(wld_cells) <> ''
    and btrim(source_url) <> '' and btrim(source_range) <> '' and btrim(pairing_evidence) <> ''
  )
);

create index if not exists historical_pyp_observations_canonical_player_idx
  on public.historical_pyp_observations(canonical_player_id);
create index if not exists historical_pyp_observations_period_idx
  on public.historical_pyp_observations(season_number, division, game_number);
create index if not exists historical_pyp_observations_pairing_idx
  on public.historical_pyp_observations(pairing_state)
  where pairing_state in ('AMBIGUOUS', 'UNKNOWN', 'UNUSABLE');

alter table public.historical_pyp_imports enable row level security;
alter table public.historical_pyp_observations enable row level security;

drop policy if exists "Site admins can read Historical PYP imports" on public.historical_pyp_imports;
create policy "Site admins can read Historical PYP imports"
  on public.historical_pyp_imports for select to authenticated
  using (public.is_current_user_site_admin());

drop policy if exists "Site admins can read Historical PYP observations" on public.historical_pyp_observations;
create policy "Site admins can read Historical PYP observations"
  on public.historical_pyp_observations for select to authenticated
  using (public.is_current_user_site_admin());

revoke all on table public.historical_pyp_imports from public, anon, authenticated;
revoke all on table public.historical_pyp_observations from public, anon, authenticated;
grant select on table public.historical_pyp_imports to authenticated;
grant select on table public.historical_pyp_observations to authenticated;

create or replace function public.commit_historical_pyp_preview(
  p_source_filename text,
  p_source_sha256 text,
  p_preview_fingerprint text,
  p_parser_version text,
  p_validated_preview jsonb
)
returns table(
  historical_pyp_import_id uuid,
  idempotent boolean,
  observation_count integer,
  resolved_identity_count integer,
  unplayed_observation_count integer
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_import public.historical_pyp_imports%rowtype;
  v_row jsonb;
  v_canonical_id uuid;
  v_source_fingerprint text;
  v_source_row_count integer := 0;
  v_observation_count integer := 0;
  v_unplayed_count integer := 0;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then
    raise exception 'Site-admin authorization is required' using errcode = '42501';
  end if;
  if nullif(btrim(p_source_filename), '') is null then
    raise exception 'Historical PYP source filename is required';
  end if;
  if p_source_sha256 is null or p_source_sha256 <> lower(p_source_sha256) or p_source_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Historical PYP source SHA-256 must be lowercase hexadecimal';
  end if;
  if nullif(btrim(p_preview_fingerprint), '') is null then
    raise exception 'Historical PYP preview fingerprint is required';
  end if;
  if jsonb_typeof(p_validated_preview) <> 'object' or jsonb_typeof(p_validated_preview -> 'rows') <> 'array' then
    raise exception 'Historical PYP validated preview rows are required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('historical_pyp_import:' || p_source_sha256, 0)
  );

  select source.* into v_import
  from public.historical_pyp_imports as source
  where source.source_sha256 = p_source_sha256
  for update;
  if found then
    if v_import.preview_fingerprint <> p_preview_fingerprint
       or v_import.parser_version <> p_parser_version then
      raise exception 'A different Historical PYP preview already uses this source SHA-256';
    end if;
    historical_pyp_import_id := v_import.id;
    idempotent := true;
    observation_count := v_import.observation_count;
    resolved_identity_count := v_import.observation_count;
    unplayed_observation_count := v_import.unplayed_observation_count;
    return next;
    return;
  end if;

  if exists (
    select 1 from public.historical_pyp_imports as source
    where source.preview_fingerprint = p_preview_fingerprint
  ) then
    raise exception 'A different Historical PYP source already uses this preview fingerprint';
  end if;

  for v_row in select value from jsonb_array_elements(p_validated_preview -> 'rows')
  loop
    v_source_row_count := v_source_row_count + 1;
    if not coalesce((v_row ->> 'importable')::boolean, false) then
      continue;
    end if;
    if (v_row ->> 'season')::integer not between 1 and 14 then
      raise exception 'Current or invalid Historical PYP season cannot be imported';
    end if;
    if nullif(btrim(v_row ->> 'historicalPlayerName'), '') is null
       or nullif(v_row ->> 'canonicalPlayerId', '') is null then
      raise exception 'Every importable Historical PYP row requires an exact name and canonical player';
    end if;
    v_canonical_id := public.resolve_canonical_player_id((v_row ->> 'canonicalPlayerId')::uuid);
    if v_canonical_id is null
       or not exists (select 1 from public.players as player where player.id = v_canonical_id) then
      raise exception 'An importable Historical PYP row references an unknown canonical player';
    end if;
    if (v_row ->> 'sourceState') not in ('PLAYED', 'UNPLAYED')
       or (v_row ->> 'sourceEra') not in ('legacy_aggregate', 'detailed_holes_won')
       or (v_row ->> 'pairingState') not in ('KNOWN', 'AMBIGUOUS', 'UNKNOWN', 'UNUSABLE') then
      raise exception 'An importable Historical PYP row has an invalid source state';
    end if;
    if nullif(v_row ->> 'opponentCanonicalPlayerId', '') is not null then
      v_canonical_id := public.resolve_canonical_player_id((v_row ->> 'opponentCanonicalPlayerId')::uuid);
      if v_canonical_id is null
         or not exists (select 1 from public.players as player where player.id = v_canonical_id) then
        raise exception 'An importable Historical PYP row references an unknown canonical opponent';
      end if;
    end if;
    v_source_fingerprint := nullif(v_row ->> 'sourceFingerprint', '');
    if v_source_fingerprint is null then
      raise exception 'Historical PYP source fingerprints are required';
    end if;
    if exists (
      select 1 from public.historical_pyp_observations as observation
      where observation.source_fingerprint = v_source_fingerprint
    ) then
      raise exception 'A Historical PYP source fingerprint already exists: %', v_source_fingerprint;
    end if;
    v_observation_count := v_observation_count + 1;
    if v_row ->> 'sourceState' = 'UNPLAYED' then
      v_unplayed_count := v_unplayed_count + 1;
    end if;
  end loop;

  insert into public.historical_pyp_imports (
    source_filename, source_sha256, preview_fingerprint, parser_version,
    validated_preview, source_row_count, observation_count, unplayed_observation_count, committed_by
  ) values (
    btrim(p_source_filename), p_source_sha256, p_preview_fingerprint, btrim(p_parser_version),
    p_validated_preview, v_source_row_count, v_observation_count, v_unplayed_count, v_user_id
  ) returning * into v_import;

  for v_row in select value from jsonb_array_elements(p_validated_preview -> 'rows')
  loop
    if not coalesce((v_row ->> 'importable')::boolean, false) then
      continue;
    end if;
    v_canonical_id := public.resolve_canonical_player_id((v_row ->> 'canonicalPlayerId')::uuid);
    insert into public.historical_pyp_observations (
      historical_pyp_import_id, source_fingerprint, season_number, division, game_number, source_era,
      historical_player_name, canonical_player_id, canonical_player_name, course_1_holes_won, course_2_holes_won,
      total_holes_won, course_1_raw, course_2_raw, total_raw, wins, losses, draws, points, published_placement,
      source_state, source_state_evidence, source_side, source_workbook, source_tab, source_row, source_cells,
      total_cell, wld_cells, source_url, source_range, pairing_state, opponent_historical_player_name,
      opponent_canonical_player_id, pairing_evidence, pairing_source_range, pairing_source_cells, pairing_source_url
    ) values (
      v_import.id, v_row ->> 'sourceFingerprint', (v_row ->> 'season')::integer, v_row ->> 'division',
      (v_row ->> 'game')::integer, v_row ->> 'sourceEra', v_row ->> 'historicalPlayerName', v_canonical_id,
      nullif(v_row ->> 'canonicalPlayerName', ''), nullif(v_row ->> 'course1HolesWon', '')::integer,
      nullif(v_row ->> 'course2HolesWon', '')::integer, nullif(v_row ->> 'totalHolesWon', '')::integer,
      coalesce(v_row ->> 'course1Raw', ''), coalesce(v_row ->> 'course2Raw', ''), coalesce(v_row ->> 'totalRaw', ''),
      nullif(v_row ->> 'wins', '')::integer, nullif(v_row ->> 'losses', '')::integer, nullif(v_row ->> 'draws', '')::integer,
      nullif(v_row ->> 'points', '')::integer, nullif(v_row ->> 'publishedPlacement', ''), v_row ->> 'sourceState',
      v_row ->> 'sourceStateEvidence', coalesce(v_row ->> 'sourceSide', ''), v_row ->> 'sourceWorkbook',
      v_row ->> 'sourceTab', (v_row ->> 'sourceRow')::integer, v_row ->> 'sourceCells', v_row ->> 'totalCell',
      v_row ->> 'wldCells', v_row ->> 'sourceUrl', v_row ->> 'sourceRange', v_row ->> 'pairingState',
      nullif(v_row ->> 'opponentHistoricalPlayerName', ''), nullif(v_row ->> 'opponentCanonicalPlayerId', '')::uuid,
      v_row ->> 'pairingEvidence',
      nullif(v_row ->> 'pairingSourceRange', ''), nullif(v_row ->> 'pairingSourceCells', ''),
      nullif(v_row ->> 'pairingSourceUrl', '')
    );
  end loop;

  historical_pyp_import_id := v_import.id;
  idempotent := false;
  observation_count := v_observation_count;
  resolved_identity_count := v_observation_count;
  unplayed_observation_count := v_unplayed_count;
  return next;
end;
$function$;

revoke all on function public.commit_historical_pyp_preview(text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.commit_historical_pyp_preview(text, text, text, text, jsonb) to authenticated;

commit;
