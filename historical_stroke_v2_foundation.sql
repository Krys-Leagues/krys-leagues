-- Historical Stroke V2 additive foundation.
-- Review-only preparation: do not run automatically. This migration preserves V1
-- tables/RPC behavior and stores V2 source facts separately under the same import
-- parent. Only site admins may read or commit these records.

begin;

alter table public.historical_stroke_imports
  add column if not exists source_era text null,
  add column if not exists period_status text not null default 'HISTORICAL / COMPLETE',
  add column if not exists importable boolean not null default true;

create table if not exists public.historical_stroke_v2_observations (
  id uuid primary key default gen_random_uuid(),
  historical_stroke_import_id uuid not null
    references public.historical_stroke_imports(id) on delete cascade,
  source_fingerprint text not null,
  season_number integer not null,
  division_number integer not null,
  historical_display_name text not null,
  canonical_player_id uuid null references public.players(id) on delete set null,
  source_era text not null,
  course_order integer not null,
  historical_course_name text not null,
  score_state text not null,
  played boolean not null,
  score integer null,
  raw_score_token text not null,
  outcome text null,
  published_placement integer null,
  played_count integer null,
  wins integer null,
  draws integer null,
  losses integer null,
  points integer null,
  strokes integer null,
  source_workbook text not null,
  source_tab text not null,
  source_row integer null,
  source_cells text not null,
  source_range text not null,
  source_url text not null,
  source_sha256 text not null,
  source_font_color text null,
  source_status text not null,
  raw_source_values jsonb not null default '{}'::jsonb,
  provenance text not null,
  importable boolean not null,
  created_at timestamptz not null default now(),
  constraint historical_stroke_v2_observation_name_nonblank check (btrim(historical_display_name) <> ''),
  constraint historical_stroke_v2_observation_score_state check (score_state in (
    'PLAYED / NUMERIC', 'UNPLAYED / BLANK', 'UNPLAYED / DASH',
    'MALFORMED SOURCE', 'CURRENT / INCOMPLETE / NOT IMPORTABLE'
  )),
  constraint historical_stroke_v2_observation_score_consistency check (
    (score_state = 'PLAYED / NUMERIC' and played and score is not null)
    or (score_state <> 'PLAYED / NUMERIC' and not played and score is null)
  ),
  constraint historical_stroke_v2_observation_source_sha check (source_sha256 ~ '^[0-9a-f]{64}$'),
  constraint historical_stroke_v2_observation_unique_source unique (historical_stroke_import_id, source_fingerprint)
);

create index if not exists historical_stroke_v2_observations_player_idx
  on public.historical_stroke_v2_observations(canonical_player_id)
  where canonical_player_id is not null;
create index if not exists historical_stroke_v2_observations_import_idx
  on public.historical_stroke_v2_observations(historical_stroke_import_id, season_number, division_number);

create table if not exists public.historical_stroke_v2_pairing_evidence (
  id uuid primary key default gen_random_uuid(),
  historical_stroke_import_id uuid not null
    references public.historical_stroke_imports(id) on delete cascade,
  deduplication_key text not null,
  season_number integer not null,
  period_type text not null,
  division_number integer null,
  game_number integer null,
  course_name text not null,
  player_a_historical_name text not null,
  player_b_historical_name text not null,
  source_row_a integer null,
  source_row_b integer null,
  source_cell_a text not null,
  source_cell_b text not null,
  source_color text null,
  played_state text not null,
  pairing_state text not null,
  evidence_type text not null,
  source_era text not null,
  source_workbook text not null,
  source_tab text not null,
  source_range text not null,
  source_url text not null,
  source_sha256 text not null,
  provenance text not null,
  notes text not null,
  created_at timestamptz not null default now(),
  constraint historical_stroke_v2_pairing_source_sha check (source_sha256 ~ '^[0-9a-f]{64}$'),
  constraint historical_stroke_v2_pairing_state check (pairing_state in (
    'SOURCE COLOR CONFIRMED — PLAYED',
    'SOURCE COLOR CONFIRMED — SCHEDULED / UNPLAYED',
    'PARTIAL — NEEDS REVIEW',
    'AMBIGUOUS COLOR GROUP — NEEDS REVIEW',
    'UNKNOWN — NO SOURCE COLOR EVIDENCE',
    'ADMIN CONFIRMED'
  )),
  constraint historical_stroke_v2_pairing_unique_source unique (historical_stroke_import_id, deduplication_key)
);

create index if not exists historical_stroke_v2_pairings_import_idx
  on public.historical_stroke_v2_pairing_evidence(historical_stroke_import_id, season_number, division_number, game_number);

create table if not exists public.historical_stroke_v2_malformed_rows (
  id uuid primary key default gen_random_uuid(),
  historical_stroke_import_id uuid not null
    references public.historical_stroke_imports(id) on delete cascade,
  source_fingerprint text not null,
  season_number integer not null,
  division_number integer null,
  source_row integer null,
  historical_display_name text not null,
  raw_source_row jsonb not null default '[]'::jsonb,
  reason text not null,
  import_status text not null,
  source_era text not null,
  source_workbook text not null,
  source_tab text not null,
  source_range text not null,
  source_url text not null,
  source_sha256 text not null,
  provenance text not null,
  importable boolean not null default false,
  created_at timestamptz not null default now(),
  constraint historical_stroke_v2_malformed_not_importable check (not importable),
  constraint historical_stroke_v2_malformed_source_sha check (source_sha256 ~ '^[0-9a-f]{64}$'),
  constraint historical_stroke_v2_malformed_unique_source unique (historical_stroke_import_id, source_fingerprint)
);

alter table public.historical_stroke_v2_observations enable row level security;
alter table public.historical_stroke_v2_pairing_evidence enable row level security;
alter table public.historical_stroke_v2_malformed_rows enable row level security;

drop policy if exists "Site admins can read Historical Stroke V2 observations" on public.historical_stroke_v2_observations;
create policy "Site admins can read Historical Stroke V2 observations"
  on public.historical_stroke_v2_observations for select to authenticated
  using (public.is_current_user_site_admin());
drop policy if exists "Site admins can read Historical Stroke V2 pairings" on public.historical_stroke_v2_pairing_evidence;
create policy "Site admins can read Historical Stroke V2 pairings"
  on public.historical_stroke_v2_pairing_evidence for select to authenticated
  using (public.is_current_user_site_admin());
drop policy if exists "Site admins can read Historical Stroke V2 malformed rows" on public.historical_stroke_v2_malformed_rows;
create policy "Site admins can read Historical Stroke V2 malformed rows"
  on public.historical_stroke_v2_malformed_rows for select to authenticated
  using (public.is_current_user_site_admin());

revoke all on table public.historical_stroke_v2_observations from public, anon, authenticated;
revoke all on table public.historical_stroke_v2_pairing_evidence from public, anon, authenticated;
revoke all on table public.historical_stroke_v2_malformed_rows from public, anon, authenticated;
grant select on table public.historical_stroke_v2_observations to authenticated;
grant select on table public.historical_stroke_v2_pairing_evidence to authenticated;
grant select on table public.historical_stroke_v2_malformed_rows to authenticated;

create or replace function public.commit_historical_stroke_preview_v2(
  p_source_filename text,
  p_normalized_source_sha256 text,
  p_preview_fingerprint text,
  p_parser_version text,
  p_validated_preview jsonb
)
returns table(
  historical_stroke_import_id uuid,
  season_number integer,
  idempotent boolean,
  observation_count integer,
  pairing_count integer,
  malformed_count integer
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_period jsonb;
  v_observation jsonb;
  v_pairing jsonb;
  v_malformed jsonb;
  v_import public.historical_stroke_imports%rowtype;
  v_observations jsonb;
  v_pairings jsonb;
  v_malformed_rows jsonb;
  v_season integer;
  v_source_sha text;
  v_fingerprint text;
  v_source_rows integer;
  v_divisions integer;
  v_standings integer;
  v_courses integer;
  v_played integer;
  v_unplayed integer;
  v_negative integer;
  v_positive integer;
  v_zero integer;
  v_pairing_count integer;
  v_malformed_count integer;
  v_requested_player_id uuid;
  v_player_id uuid;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  if p_source_filename is null or btrim(p_source_filename) = '' then
    raise exception 'Historical Stroke V2 source filename is required';
  end if;
  if p_normalized_source_sha256 is null or lower(btrim(p_normalized_source_sha256)) !~ '^[0-9a-f]{64}$' then
    raise exception 'Historical Stroke V2 normalized source SHA-256 is invalid';
  end if;
  if p_preview_fingerprint is null or btrim(p_preview_fingerprint) = '' then
    raise exception 'Historical Stroke V2 preview fingerprint is required';
  end if;
  if p_parser_version <> 'historical-stroke-v2' then
    raise exception 'Unsupported Historical Stroke V2 parser version';
  end if;
  if p_validated_preview is null or jsonb_typeof(p_validated_preview) <> 'object' then
    raise exception 'Validated Historical Stroke V2 preview must be a JSON object';
  end if;
  if jsonb_array_length(coalesce(p_validated_preview->'periods', '[]'::jsonb)) = 0 then
    raise exception 'Historical Stroke V2 preview contains no periods';
  end if;

  for v_period in select value from jsonb_array_elements(p_validated_preview->'periods') loop
    v_season := nullif(v_period->>'season', '')::integer;
    if v_season is null or v_season <= 0 then
      raise exception 'Historical Stroke V2 period has an invalid season';
    end if;
    if coalesce(v_period->>'status', '') <> 'HISTORICAL / COMPLETE' or coalesce((v_period->>'importable')::boolean, false) is not true then
      raise exception 'Current or incomplete Stroke periods cannot be committed as historical results';
    end if;
    v_source_sha := lower(coalesce(v_period->>'sourceSha256', ''));
    if v_source_sha !~ '^[0-9a-f]{64}$' then
      raise exception 'Historical Stroke V2 period source SHA-256 is invalid';
    end if;
    v_fingerprint := btrim(p_preview_fingerprint) || ':season:' || v_season::text;

    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('historical_stroke_v2_season:' || v_season::text, 0));
    v_import := null;
    select source.* into v_import
    from public.historical_stroke_imports as source
    where source.season_number = v_season
    for update;

    select coalesce(jsonb_agg(item), '[]'::jsonb) into v_observations
    from jsonb_array_elements(coalesce(p_validated_preview->'observations', '[]'::jsonb)) as items(item)
    where nullif(item->>'season', '')::integer = v_season;
    select coalesce(jsonb_agg(item), '[]'::jsonb) into v_pairings
    from jsonb_array_elements(coalesce(p_validated_preview->'pairings', '[]'::jsonb)) as items(item)
    where nullif(item->>'season', '')::integer = v_season;
    select coalesce(jsonb_agg(item), '[]'::jsonb) into v_malformed_rows
    from jsonb_array_elements(coalesce(p_validated_preview->'malformedRows', '[]'::jsonb)) as items(item)
    where nullif(item->>'season', '')::integer = v_season;

    select count(*)::integer,
           count(distinct nullif(item->>'division', '')::integer),
           count(distinct (item->>'division', item->>'historicalPlayerName', item->>'sourceRow')),
           count(*) filter (where item->>'importable' = 'true' and item->>'scoreState' = 'PLAYED / NUMERIC'),
           count(*) filter (where item->>'importable' = 'true' and item->>'scoreState' like 'UNPLAYED /%'),
           count(*) filter (where item->>'importable' = 'true' and (item->>'score')::integer < 0),
           count(*) filter (where item->>'importable' = 'true' and (item->>'score')::integer > 0),
           count(*) filter (where item->>'importable' = 'true' and (item->>'score')::integer = 0)
      into v_source_rows, v_divisions, v_standings, v_played, v_unplayed, v_negative, v_positive, v_zero
    from jsonb_array_elements(v_observations) as items(item);
    v_courses := v_played + v_unplayed;
    select count(*)::integer into v_pairing_count from jsonb_array_elements(v_pairings);
    select count(*)::integer into v_malformed_count from jsonb_array_elements(v_malformed_rows);
    if v_source_rows = 0 or v_divisions = 0 or v_standings = 0 then
      raise exception 'Historical Stroke V2 period has no importable standings';
    end if;

    if v_import.id is not null then
      if v_import.parser_version = 'historical-stroke-v2'
         and v_import.source_sha256 = v_source_sha
         and v_import.preview_fingerprint = v_fingerprint
         and v_import.validated_preview = jsonb_build_object('period', v_period, 'observations', v_observations, 'pairings', v_pairings, 'malformedRows', v_malformed_rows, 'identityDecisions', coalesce(p_validated_preview->'identityDecisions', '[]'::jsonb)) then
        historical_stroke_import_id := v_import.id;
        season_number := v_season;
        idempotent := true;
        observation_count := v_courses;
        pairing_count := v_pairing_count;
        malformed_count := v_malformed_count;
        return next;
        continue;
      end if;
      raise exception 'A different Historical Stroke source is already committed for season %', v_season;
    end if;

    insert into public.historical_stroke_imports (
      season_number, historical_label, historical_year, source_filename,
      source_sha256, preview_fingerprint, parser_version, raw_header_text,
      raw_end_date_text, source_row_count, source_column_count, division_count,
      populated_division_count, standing_count, bye_count, template_count,
      malformed_count, left_right_conflict_count, statistical_conflict_count,
      course_appearance_count, played_appearance_count, unplayed_appearance_count,
      negative_played_score_count, positive_played_score_count,
      numeric_zero_played_score_count, validated_preview, source_era,
      period_status, importable
    ) values (
      v_season, 'Historical Stroke Season ' || v_season::text, null,
      p_source_filename || ' [season ' || v_season::text || ']', v_source_sha,
      v_fingerprint, 'historical-stroke-v2', '', '', v_source_rows, null,
      v_divisions, v_divisions, v_standings, 0, 0, v_malformed_count, 0, 0,
      v_courses, v_played, v_unplayed, v_negative, v_positive, v_zero,
      jsonb_build_object('period', v_period, 'observations', v_observations, 'pairings', v_pairings, 'malformedRows', v_malformed_rows, 'identityDecisions', coalesce(p_validated_preview->'identityDecisions', '[]'::jsonb)),
      coalesce(v_period->>'sourceEra', ''), 'HISTORICAL / COMPLETE', true
    ) returning * into v_import;

    for v_observation in select value from jsonb_array_elements(v_observations) loop
      v_requested_player_id := nullif((select decision->>'canonicalPlayerId'
        from jsonb_array_elements(coalesce(p_validated_preview->'identityDecisions', '[]'::jsonb)) as decisions(decision)
        where decision->>'historicalPlayerName' = v_observation->>'historicalPlayerName'
        limit 1), '')::uuid;
      if v_requested_player_id is not null then
        if not exists (select 1 from public.players as player where player.id = v_requested_player_id) then
          raise exception 'Historical Stroke V2 identity decision references an unknown player';
        end if;
        v_player_id := public.resolve_canonical_player_id(v_requested_player_id);
      else
        v_player_id := null;
      end if;
      insert into public.historical_stroke_v2_observations (
        historical_stroke_import_id, source_fingerprint, season_number,
        division_number, historical_display_name, canonical_player_id, source_era, course_order,
        historical_course_name, score_state, played, score, raw_score_token,
        outcome, published_placement, played_count, wins, draws, losses, points,
        strokes, source_workbook, source_tab, source_row, source_cells,
        source_range, source_url, source_sha256, source_font_color, source_status,
        raw_source_values, provenance, importable
      ) values (
        v_import.id, v_observation->>'sourceFingerprint', v_season,
        (v_observation->>'division')::integer, v_observation->>'historicalPlayerName', v_player_id,
        v_observation->>'sourceEra', (v_observation->>'courseOrder')::integer,
        v_observation->>'courseName', v_observation->>'scoreState',
        (v_observation->>'played')::boolean, nullif(v_observation->>'score', '')::integer,
        coalesce(v_observation->>'rawScoreToken', ''), nullif(v_observation->>'outcome', ''),
        nullif(v_observation->>'publishedPlacement', '')::integer,
        nullif(v_observation->>'playedCount', '')::integer, nullif(v_observation->>'wins', '')::integer,
        nullif(v_observation->>'draws', '')::integer, nullif(v_observation->>'losses', '')::integer,
        nullif(v_observation->>'points', '')::integer, nullif(v_observation->>'strokes', '')::integer,
        coalesce(v_observation->'source'->>'workbook', ''), coalesce(v_observation->'source'->>'tab', ''),
        nullif(v_observation->'source'->>'sourceRow', '')::integer, coalesce(v_observation->>'sourceScoreCell', ''),
        coalesce(v_observation->>'sourceScoreRange', ''), coalesce(v_observation->'source'->>'sourceUrl', ''),
        lower(v_observation->'source'->>'sourceSha256'), nullif(v_observation->>'sourceFontColor', ''),
        coalesce(v_observation->'source'->>'sourceStatus', 'HISTORICAL / COMPLETE'),
        coalesce(v_observation->'rawSourceValues', '{}'::jsonb), coalesce(v_observation->'source'->>'provenance', ''),
        coalesce((v_observation->>'importable')::boolean, false)
      );
    end loop;

    for v_pairing in select value from jsonb_array_elements(v_pairings) loop
      insert into public.historical_stroke_v2_pairing_evidence (
        historical_stroke_import_id, deduplication_key, season_number,
        period_type, division_number, game_number, course_name,
        player_a_historical_name, player_b_historical_name, source_row_a,
        source_row_b, source_cell_a, source_cell_b, source_color, played_state,
        pairing_state, evidence_type, source_era, source_workbook, source_tab,
        source_range, source_url, source_sha256, provenance, notes
      ) values (
        v_import.id, v_pairing->>'deduplicationKey', v_season,
        coalesce(v_pairing->>'periodType', 'season'), nullif(v_pairing->>'division', '')::integer,
        nullif(v_pairing->>'gameNumber', '')::integer, coalesce(v_pairing->>'courseName', ''),
        coalesce(v_pairing->>'playerA', ''), coalesce(v_pairing->>'playerB', ''),
        nullif(v_pairing->>'sourceRowA', '')::integer, nullif(v_pairing->>'sourceRowB', '')::integer,
        coalesce(v_pairing->>'sourceCellA', ''), coalesce(v_pairing->>'sourceCellB', ''),
        nullif(v_pairing->>'sourceColor', ''), coalesce(v_pairing->>'playedState', ''),
        v_pairing->>'pairingState', coalesce(v_pairing->>'evidenceType', ''),
        v_pairing->'source'->>'sourceEra', v_pairing->'source'->>'workbook',
        v_pairing->'source'->>'tab', v_pairing->'source'->>'sourceRange',
        v_pairing->'source'->>'sourceUrl', lower(v_pairing->'source'->>'sourceSha256'),
        v_pairing->'source'->>'provenance', coalesce(v_pairing->>'notes', '')
      );
    end loop;

    for v_malformed in select value from jsonb_array_elements(v_malformed_rows) loop
      insert into public.historical_stroke_v2_malformed_rows (
        historical_stroke_import_id, source_fingerprint, season_number,
        division_number, source_row, historical_display_name, raw_source_row,
        reason, import_status, source_era, source_workbook, source_tab,
        source_range, source_url, source_sha256, provenance
      ) values (
        v_import.id, md5(v_malformed::text), v_season,
        nullif(v_malformed->>'division', '')::integer, nullif(v_malformed->>'sourceRow', '')::integer,
        v_malformed->>'historicalPlayerName', coalesce(v_malformed->'rawSourceRow', '[]'::jsonb),
        v_malformed->>'reason', v_malformed->>'importStatus', v_malformed->'source'->>'sourceEra',
        v_malformed->'source'->>'workbook', v_malformed->'source'->>'tab',
        v_malformed->'source'->>'sourceRange', v_malformed->'source'->>'sourceUrl',
        lower(v_malformed->'source'->>'sourceSha256'), v_malformed->'source'->>'provenance'
      );
    end loop;

    historical_stroke_import_id := v_import.id;
    season_number := v_season;
    idempotent := false;
    observation_count := v_courses;
    pairing_count := v_pairing_count;
    malformed_count := v_malformed_count;
    return next;
  end loop;
end;
$function$;

revoke all on function public.commit_historical_stroke_preview_v2(text,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.commit_historical_stroke_preview_v2(text,text,text,text,jsonb)
  to authenticated;

commit;
