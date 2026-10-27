begin;

-- Historical Stroke is an isolated, aggregate-only historical store. It has no
-- dependency on managed Stroke schedules, results, standings, or scorecards.

create table if not exists public.historical_stroke_imports (
  id uuid primary key default gen_random_uuid(),
  season_number integer not null,
  historical_label text not null,
  historical_year integer null,
  raw_header_text text not null,
  raw_end_date_text text not null,
  source_filename text not null,
  source_sha256 text not null,
  preview_fingerprint text not null,
  parser_version text not null,
  validated_preview jsonb not null,
  source_row_count integer not null,
  source_column_count integer null,
  division_count integer not null,
  populated_division_count integer not null,
  standing_count integer not null,
  bye_count integer not null,
  template_count integer not null,
  malformed_count integer not null,
  left_right_conflict_count integer not null,
  statistical_conflict_count integer not null,
  course_appearance_count integer not null,
  played_appearance_count integer not null,
  unplayed_appearance_count integer not null,
  negative_played_score_count integer not null,
  positive_played_score_count integer not null,
  numeric_zero_played_score_count integer not null,
  committed_at timestamptz not null default now(),
  committed_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint historical_stroke_imports_season_positive check (season_number > 0),
  constraint historical_stroke_imports_label_nonblank check (btrim(historical_label) <> ''),
  constraint historical_stroke_imports_year_positive check (historical_year is null or historical_year > 0),
  constraint historical_stroke_imports_header_nonblank check (btrim(raw_header_text) <> ''),
  constraint historical_stroke_imports_filename_nonblank check (btrim(source_filename) <> ''),
  constraint historical_stroke_imports_sha_format check (
    source_sha256 = lower(source_sha256) and source_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint historical_stroke_imports_fingerprint_nonblank check (btrim(preview_fingerprint) <> ''),
  constraint historical_stroke_imports_parser_nonblank check (btrim(parser_version) <> ''),
  constraint historical_stroke_imports_preview_object check (jsonb_typeof(validated_preview) = 'object'),
  constraint historical_stroke_imports_counts_nonnegative check (
    source_row_count > 0
    and (source_column_count is null or source_column_count > 0)
    and division_count > 0
    and populated_division_count >= 0
    and populated_division_count <= division_count
    and standing_count > 0
    and bye_count >= 0
    and template_count >= 0
    and malformed_count >= 0
    and left_right_conflict_count >= 0
    and statistical_conflict_count >= 0
    and course_appearance_count >= 0
    and played_appearance_count >= 0
    and unplayed_appearance_count >= 0
    and negative_played_score_count >= 0
    and positive_played_score_count >= 0
    and numeric_zero_played_score_count >= 0
    and course_appearance_count = played_appearance_count + unplayed_appearance_count
    and played_appearance_count = negative_played_score_count
      + positive_played_score_count + numeric_zero_played_score_count
  ),
  constraint historical_stroke_imports_season_key unique (season_number),
  constraint historical_stroke_imports_exact_key
    unique (season_number, source_sha256, preview_fingerprint, parser_version),
  constraint historical_stroke_imports_source_sha_key unique (source_sha256),
  constraint historical_stroke_imports_preview_fingerprint_key unique (preview_fingerprint)
);

create table if not exists public.historical_stroke_standings (
  id uuid primary key default gen_random_uuid(),
  historical_stroke_import_id uuid not null
    references public.historical_stroke_imports(id) on delete cascade,
  division_number integer not null,
  source_row_number integer not null,
  source_position integer null,
  source_display_position integer null,
  historical_display_name text not null,
  player_id uuid null references public.players(id) on delete set null,
  played integer not null,
  wins integer not null,
  draws integer not null,
  losses integer not null,
  points integer not null,
  strokes integer not null,
  identity_reviewed_at timestamptz null,
  identity_reviewed_by uuid null references auth.users(id) on delete set null,
  identity_resolution_note text null,
  created_at timestamptz not null default now(),
  constraint historical_stroke_standings_division_positive check (division_number > 0),
  constraint historical_stroke_standings_source_row_positive check (source_row_number > 0),
  constraint historical_stroke_standings_source_position_positive
    check (source_position is null or source_position > 0),
  constraint historical_stroke_standings_display_position_positive
    check (source_display_position is null or source_display_position > 0),
  constraint historical_stroke_standings_name_nonblank check (btrim(historical_display_name) <> ''),
  constraint historical_stroke_standings_totals check (
    played >= 0 and wins >= 0 and draws >= 0 and losses >= 0 and points >= 0
    and played = wins + draws + losses
    and points = wins * 3 + draws
  ),
  constraint historical_stroke_standings_source_row_key
    unique (historical_stroke_import_id, source_row_number),
  constraint historical_stroke_standings_division_position_key
    unique (historical_stroke_import_id, division_number, source_position),
  constraint historical_stroke_standings_division_name_key
    unique (historical_stroke_import_id, division_number, historical_display_name)
);

create index if not exists historical_stroke_standings_player_idx
  on public.historical_stroke_standings(player_id) where player_id is not null;

create table if not exists public.historical_stroke_course_appearances (
  id uuid primary key default gen_random_uuid(),
  historical_stroke_standing_id uuid not null
    references public.historical_stroke_standings(id) on delete cascade,
  course_order integer not null,
  historical_course_name text not null,
  played boolean not null,
  score integer null,
  raw_score_token text not null,
  win_marker boolean not null,
  loss_marker boolean not null,
  draw_marker boolean not null,
  outcome text null,
  created_at timestamptz not null default now(),
  constraint historical_stroke_course_order_positive check (course_order > 0),
  constraint historical_stroke_course_name_nonblank check (btrim(historical_course_name) <> ''),
  constraint historical_stroke_course_marker_consistency check (
    (win_marker::integer + loss_marker::integer + draw_marker::integer) <= 1
    and (
      (played and score is not null and outcome in ('W', 'L', 'D')
        and win_marker = (outcome = 'W')
        and loss_marker = (outcome = 'L')
        and draw_marker = (outcome = 'D'))
      or
      (not played and score is null and outcome is null
        and not win_marker and not loss_marker and not draw_marker)
    )
  ),
  constraint historical_stroke_course_standing_order_key
    unique (historical_stroke_standing_id, course_order),
  constraint historical_stroke_course_standing_name_key
    unique (historical_stroke_standing_id, historical_course_name)
);

alter table public.historical_stroke_imports enable row level security;
alter table public.historical_stroke_standings enable row level security;
alter table public.historical_stroke_course_appearances enable row level security;

drop policy if exists "Site admins can read Historical Stroke imports" on public.historical_stroke_imports;
create policy "Site admins can read Historical Stroke imports"
  on public.historical_stroke_imports for select to authenticated
  using (public.is_current_user_site_admin());
drop policy if exists "Site admins can read Historical Stroke standings" on public.historical_stroke_standings;
create policy "Site admins can read Historical Stroke standings"
  on public.historical_stroke_standings for select to authenticated
  using (public.is_current_user_site_admin());
drop policy if exists "Site admins can read Historical Stroke appearances" on public.historical_stroke_course_appearances;
create policy "Site admins can read Historical Stroke appearances"
  on public.historical_stroke_course_appearances for select to authenticated
  using (public.is_current_user_site_admin());

revoke all on table public.historical_stroke_imports from public, anon, authenticated;
revoke all on table public.historical_stroke_standings from public, anon, authenticated;
revoke all on table public.historical_stroke_course_appearances from public, anon, authenticated;
grant select on table public.historical_stroke_imports to authenticated;
grant select on table public.historical_stroke_standings to authenticated;
grant select on table public.historical_stroke_course_appearances to authenticated;

create or replace function public.commit_historical_stroke_preview(
  p_season_number integer,
  p_historical_label text,
  p_historical_year integer,
  p_source_filename text,
  p_source_sha256 text,
  p_preview_fingerprint text,
  p_parser_version text,
  p_validated_preview jsonb
)
returns table(
  historical_stroke_import_id uuid,
  idempotent boolean,
  standing_count integer,
  course_appearance_count integer,
  resolved_identity_count integer,
  unresolved_identity_count integer
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_import public.historical_stroke_imports%rowtype;
  v_division jsonb;
  v_standing jsonb;
  v_course jsonb;
  v_standing_id uuid;
  v_requested_player_id uuid;
  v_player_id uuid;
  v_source_row integer;
  v_source_position integer;
  v_display_position integer;
  v_division_number integer;
  v_course_order integer;
  v_played integer;
  v_wins integer;
  v_draws integer;
  v_losses integer;
  v_points integer;
  v_strokes integer;
  v_score integer;
  v_course_played boolean;
  v_win_marker boolean;
  v_loss_marker boolean;
  v_draw_marker boolean;
  v_outcome text;
  v_payload_year integer;
  v_expected_standings integer := 0;
  v_expected_populated_divisions integer := 0;
  v_expected_courses integer := 0;
  v_expected_played integer := 0;
  v_expected_unplayed integer := 0;
  v_expected_negative integer := 0;
  v_expected_positive integer := 0;
  v_expected_zero integer := 0;
  v_inserted_standings integer := 0;
  v_inserted_courses integer := 0;
  v_resolved integer := 0;
  v_unresolved integer := 0;
  v_course_wins integer;
  v_course_draws integer;
  v_course_losses integer;
  v_course_score_total integer;
  v_duplicate_count integer;
  v_division_numbers integer[] := array[]::integer[];
begin
  if v_user_id is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  if p_season_number is null or p_season_number <= 0 then
    raise exception 'Historical Stroke season number must be a positive integer';
  end if;
  if p_historical_label is null or btrim(p_historical_label) = '' then
    raise exception 'Historical Stroke label is required';
  end if;
  if p_historical_year is not null and p_historical_year <= 0 then
    raise exception 'Historical year must be positive when supplied';
  end if;
  if p_source_filename is null or btrim(p_source_filename) = '' then
    raise exception 'Historical Stroke source filename is required';
  end if;
  if p_source_sha256 is null or lower(btrim(p_source_sha256)) !~ '^[0-9a-f]{64}$' then
    raise exception 'Historical Stroke source SHA-256 must be 64 hexadecimal characters';
  end if;
  if p_preview_fingerprint is null or btrim(p_preview_fingerprint) = '' then
    raise exception 'Historical Stroke preview fingerprint is required';
  end if;
  if p_parser_version is null or btrim(p_parser_version) = '' then
    raise exception 'Historical Stroke parser version is required';
  end if;
  if btrim(p_parser_version) <> 'historical-stroke-v1' then
    raise exception 'Unsupported Historical Stroke parser version';
  end if;
  if p_validated_preview is null or jsonb_typeof(p_validated_preview) <> 'object' then
    raise exception 'Validated Historical Stroke preview must be a JSON object';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('historical_stroke_season:' || p_season_number::text, 0)
  );
  select source.* into v_import
  from public.historical_stroke_imports as source
  where source.season_number = p_season_number
  for update;
  if found then
    if v_import.source_sha256 = lower(btrim(p_source_sha256))
       and v_import.preview_fingerprint = btrim(p_preview_fingerprint)
       and v_import.parser_version = btrim(p_parser_version)
       and v_import.historical_label = p_historical_label
       and v_import.historical_year is not distinct from p_historical_year
       and v_import.source_filename = p_source_filename
       and v_import.validated_preview = p_validated_preview then
      historical_stroke_import_id := v_import.id;
      idempotent := true;
      select count(*)::integer,
             count(*) filter (where standing.player_id is not null)::integer,
             count(*) filter (where standing.player_id is null)::integer
      into standing_count, resolved_identity_count, unresolved_identity_count
      from public.historical_stroke_standings as standing
      where standing.historical_stroke_import_id = v_import.id;
      select count(*)::integer into course_appearance_count
      from public.historical_stroke_course_appearances as appearance
      join public.historical_stroke_standings as standing
        on standing.id = appearance.historical_stroke_standing_id
      where standing.historical_stroke_import_id = v_import.id;
      return next;
      return;
    end if;
    raise exception 'Historical Stroke Season % already has different committed source or metadata; delete it explicitly before reimporting', p_season_number;
  end if;
  if exists (select 1 from public.historical_stroke_imports where source_sha256 = lower(btrim(p_source_sha256))) then
    raise exception 'This Historical Stroke source SHA-256 is already committed with inconsistent metadata';
  end if;
  if exists (select 1 from public.historical_stroke_imports where preview_fingerprint = btrim(p_preview_fingerprint)) then
    raise exception 'This Historical Stroke preview fingerprint is already committed with inconsistent metadata';
  end if;

  if p_validated_preview ->> 'parserVersion' is distinct from p_parser_version then
    raise exception 'Preview parser version does not agree with commit metadata';
  end if;
  if p_validated_preview #>> '{source,filename}' is distinct from p_source_filename
     or lower(coalesce(p_validated_preview #>> '{source,sourceSha256}', '')) is distinct from lower(btrim(p_source_sha256)) then
    raise exception 'Preview source metadata does not agree with commit metadata';
  end if;
  if coalesce(p_validated_preview #>> '{season,seasonNumber}', '') !~ '^\d+$'
     or jsonb_typeof(p_validated_preview #> '{season,seasonNumber}') <> 'number'
     or (p_validated_preview #>> '{season,seasonNumber}')::integer <> p_season_number then
    raise exception 'Preview season number does not agree with commit metadata';
  end if;
  if p_validated_preview #>> '{season,historicalSeasonLabel}' is distinct from p_historical_label then
    raise exception 'Preview historical label does not agree with commit metadata';
  end if;
  if coalesce(jsonb_typeof(p_validated_preview #> '{season,historicalSeasonLabel}'), 'missing') <> 'string'
     or coalesce(jsonb_typeof(p_validated_preview #> '{season,rawHeader}'), 'missing') <> 'string'
     or coalesce(jsonb_typeof(p_validated_preview #> '{season,rawEndDateText}'), 'missing') <> 'string'
     or coalesce(jsonb_typeof(p_validated_preview #> '{season,historicalYear}'), 'missing') not in ('number', 'null') then
    raise exception 'Preview season metadata has invalid JSON types';
  end if;
  begin
    v_payload_year := nullif(p_validated_preview #>> '{season,historicalYear}', '')::integer;
  exception when invalid_text_representation then
    raise exception 'Preview historical year is not a valid integer or null';
  end;
  if v_payload_year is distinct from p_historical_year then
    raise exception 'Preview historical year does not agree with commit metadata';
  end if;
  if coalesce(p_validated_preview #>> '{season,rawHeader}', '') = '' then
    raise exception 'Preview raw season header is required';
  end if;
  if jsonb_typeof(p_validated_preview -> 'divisions') <> 'array'
     or jsonb_array_length(p_validated_preview -> 'divisions') = 0 then
    raise exception 'Preview divisions must be a nonempty array';
  end if;
  if jsonb_typeof(p_validated_preview -> 'audit') <> 'object'
     or jsonb_typeof(p_validated_preview -> 'byeRows') <> 'array'
     or jsonb_typeof(p_validated_preview -> 'templateRows') <> 'array'
     or jsonb_typeof(p_validated_preview -> 'malformedRows') <> 'array'
     or jsonb_typeof(p_validated_preview -> 'issues') <> 'array' then
    raise exception 'Preview audit and classification collections are required';
  end if;
  if jsonb_typeof(p_validated_preview -> 'source') <> 'object'
     or not ((p_validated_preview -> 'source') ? 'columnsPerRow')
     or jsonb_typeof(p_validated_preview #> '{source,filename}') <> 'string'
     or jsonb_typeof(p_validated_preview #> '{source,sourceSha256}') <> 'string'
     or coalesce(p_validated_preview #>> '{source,rows}', '') !~ '^\d+$'
     or jsonb_typeof(p_validated_preview #> '{source,rows}') <> 'number'
     or (p_validated_preview #>> '{source,rows}')::integer <= 0
     or not (
       p_validated_preview #> '{source,columnsPerRow}' = 'null'::jsonb
       or jsonb_typeof(p_validated_preview #> '{source,columnsPerRow}') = 'number'
          and coalesce(p_validated_preview #>> '{source,columnsPerRow}', '') ~ '^\d+$'
          and (p_validated_preview #>> '{source,columnsPerRow}')::integer > 0
     ) then
    raise exception 'Preview source row and column metadata is invalid';
  end if;
  if jsonb_array_length(p_validated_preview -> 'malformedRows') <> 0
     or coalesce(p_validated_preview #>> '{audit,malformedRealPlayerRows}', '') <> '0' then
    raise exception 'Preview contains malformed real-player rows';
  end if;
  if coalesce(p_validated_preview #>> '{audit,leftRightConflicts}', '') <> '0' then
    raise exception 'Preview contains left/right statistical conflicts';
  end if;
  if coalesce(p_validated_preview #>> '{audit,statisticalConflicts}', '') <> '0'
     or jsonb_array_length(p_validated_preview -> 'issues') <> 0 then
    raise exception 'Preview contains unresolved statistical issues';
  end if;
  if coalesce(p_validated_preview #>> '{audit,historicalFixtures}', '') <> '0'
     or p_validated_preview ? 'fixtures' or p_validated_preview ? 'opponents'
     or jsonb_path_exists(p_validated_preview, '$.**.opponent')
     or jsonb_path_exists(p_validated_preview, '$.**.opponentId')
     or jsonb_path_exists(p_validated_preview, '$.**.fixture')
     or jsonb_path_exists(p_validated_preview, '$.**.fixtureId') then
    raise exception 'Historical Stroke aggregate previews cannot contain opponents or fixtures';
  end if;

  with preview_standings as (
    select division.value ->> 'divisionNumber' division_number,
           standing.value ->> 'sourceRow' source_row,
           standing.value ->> 'sourcePosition' source_position,
           standing.value ->> 'historicalDisplayName' historical_name
    from jsonb_array_elements(p_validated_preview -> 'divisions') division(value)
    cross join lateral jsonb_array_elements(division.value -> 'standings') standing(value)
  ), duplicate_keys as (
    select 1 from preview_standings group by source_row having count(*) > 1
    union all select 1 from preview_standings where source_position is not null
      group by division_number, source_position having count(*) > 1
    union all select 1 from preview_standings group by division_number, historical_name having count(*) > 1
  )
  select count(*)::integer into v_duplicate_count from duplicate_keys;
  if v_duplicate_count > 0 then
    raise exception 'Preview contains duplicate Historical Stroke standing records';
  end if;

  for v_division in select value from jsonb_array_elements(p_validated_preview -> 'divisions')
  loop
    if jsonb_typeof(v_division) <> 'object'
       or coalesce(v_division ->> 'divisionNumber', '') !~ '^\d+$'
       or jsonb_typeof(v_division -> 'divisionNumber') <> 'number'
       or (v_division ->> 'divisionNumber')::integer <= 0
       or jsonb_typeof(v_division -> 'standings') <> 'array' then
      raise exception 'Every division requires a positive divisionNumber and standings array';
    end if;
    v_division_number := (v_division ->> 'divisionNumber')::integer;
    if v_division_number = any(v_division_numbers) then
      raise exception 'Preview contains a duplicate division number';
    end if;
    v_division_numbers := array_append(v_division_numbers, v_division_number);
    if jsonb_typeof(v_division -> 'populated') <> 'boolean'
       or jsonb_typeof(v_division -> 'sourceDisplayOrder') <> 'array'
       or coalesce(v_division ->> 'sourceLabel', '') = '' then
      raise exception 'Division source metadata is invalid';
    end if;
    if (v_division ->> 'populated')::boolean
       <> (jsonb_array_length(v_division -> 'standings') > 0) then
      raise exception 'Division populated flag does not agree with its standings';
    end if;
    if (v_division ->> 'populated')::boolean then
      v_expected_populated_divisions := v_expected_populated_divisions + 1;
    end if;
    for v_standing in select value from jsonb_array_elements(v_division -> 'standings')
    loop
      if jsonb_typeof(v_standing) <> 'object' then
        raise exception 'Every Historical Stroke standing must be an object';
      end if;
      if v_standing ->> 'historicalDisplayName' is null
         or jsonb_typeof(v_standing -> 'historicalDisplayName') <> 'string'
         or btrim(v_standing ->> 'historicalDisplayName') = ''
         or upper(btrim(v_standing ->> 'historicalDisplayName')) = 'BYE' then
        raise exception 'A standing cannot have a blank or BYE historical display name';
      end if;
      if coalesce(v_standing ->> 'divisionNumber', '') !~ '^\d+$'
         or jsonb_typeof(v_standing -> 'divisionNumber') <> 'number'
         or (v_standing ->> 'divisionNumber')::integer <> v_division_number then
        raise exception 'Standing division metadata is invalid or disagrees with its parent';
      end if;
      if coalesce(v_standing ->> 'sourceRow', '') !~ '^\d+$'
         or jsonb_typeof(v_standing -> 'sourceRow') <> 'number'
         or (v_standing ->> 'sourceRow')::integer <= 0 then
        raise exception 'Every standing requires a positive sourceRow';
      end if;
      v_source_row := (v_standing ->> 'sourceRow')::integer;
      begin
        if coalesce(jsonb_typeof(v_standing -> 'sourcePosition'), 'missing') not in ('number', 'null')
           or coalesce(jsonb_typeof(v_standing -> 'sourceDisplayPosition'), 'missing') not in ('number', 'null') then
          raise exception 'Standing source positions have invalid JSON types';
        end if;
        v_source_position := nullif(v_standing ->> 'sourcePosition', '')::integer;
        v_display_position := nullif(v_standing ->> 'sourceDisplayPosition', '')::integer;
      exception when invalid_text_representation then
        raise exception 'Standing source positions must be positive integers or null';
      end;
      if v_source_position is not null and v_source_position <= 0
         or v_display_position is not null and v_display_position <= 0 then
        raise exception 'Standing source positions must be positive when supplied';
      end if;
      if coalesce(v_standing ->> 'played', '') !~ '^\d+$'
         or coalesce(v_standing ->> 'wins', '') !~ '^\d+$'
         or coalesce(v_standing ->> 'draws', '') !~ '^\d+$'
         or coalesce(v_standing ->> 'losses', '') !~ '^\d+$'
         or coalesce(v_standing ->> 'points', '') !~ '^\d+$'
         or coalesce(v_standing ->> 'strokes', '') !~ '^-?\d+$' then
        raise exception 'Standing P/W/D/L/PTS/STROKES values must be integers';
      end if;
      if jsonb_typeof(v_standing -> 'played') <> 'number'
         or jsonb_typeof(v_standing -> 'wins') <> 'number'
         or jsonb_typeof(v_standing -> 'draws') <> 'number'
         or jsonb_typeof(v_standing -> 'losses') <> 'number'
         or jsonb_typeof(v_standing -> 'points') <> 'number'
         or jsonb_typeof(v_standing -> 'strokes') <> 'number' then
        raise exception 'Standing P/W/D/L/PTS/STROKES values must use JSON number types';
      end if;
      v_played := (v_standing ->> 'played')::integer;
      v_wins := (v_standing ->> 'wins')::integer;
      v_draws := (v_standing ->> 'draws')::integer;
      v_losses := (v_standing ->> 'losses')::integer;
      v_points := (v_standing ->> 'points')::integer;
      v_strokes := (v_standing ->> 'strokes')::integer;
      if v_played <> v_wins + v_draws + v_losses then
        raise exception 'Standing P does not equal W + D + L';
      end if;
      if v_points <> v_wins * 3 + v_draws then
        raise exception 'Standing PTS does not equal W * 3 + D';
      end if;
      if jsonb_typeof(v_standing -> 'courses') <> 'array' then
        raise exception 'Every standing requires a courses array';
      end if;

      v_requested_player_id := null;
      v_player_id := null;
      if coalesce(jsonb_typeof(v_standing -> 'canonicalPlayerId'), 'missing') not in ('string', 'null') then
        raise exception 'canonicalPlayerId must be a UUID string or null';
      end if;
      if nullif(v_standing ->> 'canonicalPlayerId', '') is not null then
        begin
          v_requested_player_id := (v_standing ->> 'canonicalPlayerId')::uuid;
        exception when invalid_text_representation then
          raise exception 'canonicalPlayerId is not a valid UUID';
        end;
        if not exists (select 1 from public.players where id = v_requested_player_id) then
          raise exception 'Approved canonical player does not exist';
        end if;
        v_player_id := public.resolve_canonical_player_id(v_requested_player_id);
        if v_player_id is null or not exists (select 1 from public.players where id = v_player_id) then
          raise exception 'Approved player identity could not be resolved canonically';
        end if;
      end if;

      select count(*)::integer into v_duplicate_count
      from (
        select 1 from jsonb_array_elements(v_standing -> 'courses') course(value)
        group by course.value ->> 'courseOrder' having count(*) > 1
        union all
        select 1 from jsonb_array_elements(v_standing -> 'courses') course(value)
        group by course.value ->> 'courseName' having count(*) > 1
      ) duplicates;
      if v_duplicate_count > 0 then
        raise exception 'Standing contains duplicate course order or course name';
      end if;

      v_course_wins := 0;
      v_course_draws := 0;
      v_course_losses := 0;
      v_course_score_total := 0;
      for v_course in select value from jsonb_array_elements(v_standing -> 'courses')
      loop
        if jsonb_typeof(v_course) <> 'object'
           or coalesce(v_course ->> 'courseOrder', '') !~ '^\d+$'
           or jsonb_typeof(v_course -> 'courseOrder') <> 'number'
           or (v_course ->> 'courseOrder')::integer <= 0
           or coalesce(v_course ->> 'courseName', '') = ''
           or jsonb_typeof(v_course -> 'courseName') <> 'string'
           or jsonb_typeof(v_course -> 'played') <> 'boolean'
           or jsonb_typeof(v_course -> 'winMarker') <> 'boolean'
           or jsonb_typeof(v_course -> 'lossMarker') <> 'boolean'
           or jsonb_typeof(v_course -> 'drawMarker') <> 'boolean'
           or jsonb_typeof(v_course -> 'rawScoreToken') <> 'string'
           or coalesce(jsonb_typeof(v_course -> 'score'), 'missing') not in ('number', 'null')
           or coalesce(jsonb_typeof(v_course -> 'outcome'), 'missing') not in ('string', 'null') then
          raise exception 'Course appearance shape is invalid';
        end if;
        v_course_order := (v_course ->> 'courseOrder')::integer;
        v_course_played := (v_course ->> 'played')::boolean;
        v_win_marker := (v_course ->> 'winMarker')::boolean;
        v_loss_marker := (v_course ->> 'lossMarker')::boolean;
        v_draw_marker := (v_course ->> 'drawMarker')::boolean;
        v_outcome := v_course ->> 'outcome';
        begin
          v_score := nullif(v_course ->> 'score', '')::integer;
        exception when invalid_text_representation or numeric_value_out_of_range then
          raise exception 'Course score must be an integer or null';
        end;
        if (v_win_marker::integer + v_loss_marker::integer + v_draw_marker::integer) > 1 then
          raise exception 'Course appearance has contradictory W/L/D markers';
        end if;
        if v_course_played then
          if v_score is null or v_outcome not in ('W', 'L', 'D')
             or v_win_marker <> (v_outcome = 'W')
             or v_loss_marker <> (v_outcome = 'L')
             or v_draw_marker <> (v_outcome = 'D') then
            raise exception 'Played course requires a numeric score and one matching outcome marker';
          end if;
          v_expected_played := v_expected_played + 1;
          v_course_score_total := v_course_score_total + v_score;
          v_course_wins := v_course_wins + (v_outcome = 'W')::integer;
          v_course_draws := v_course_draws + (v_outcome = 'D')::integer;
          v_course_losses := v_course_losses + (v_outcome = 'L')::integer;
          v_expected_negative := v_expected_negative + (v_score < 0)::integer;
          v_expected_positive := v_expected_positive + (v_score > 0)::integer;
          v_expected_zero := v_expected_zero + (v_score = 0)::integer;
        else
          if v_score is not null or v_outcome is not null
             or v_win_marker or v_loss_marker or v_draw_marker
             or v_course ->> 'rawScoreToken' <> '-' then
            raise exception 'Unplayed course requires null score and no outcome markers';
          end if;
          v_expected_unplayed := v_expected_unplayed + 1;
        end if;
        v_expected_courses := v_expected_courses + 1;
      end loop;
      if v_course_wins <> v_wins or v_course_draws <> v_draws or v_course_losses <> v_losses then
        raise exception 'Course W/D/L totals do not match the standing totals';
      end if;
      if v_course_wins + v_course_draws + v_course_losses <> v_played then
        raise exception 'Played course count does not match P';
      end if;
      if v_course_score_total <> v_strokes then
        raise exception 'Course score total does not match STROKES';
      end if;

      v_expected_standings := v_expected_standings + 1;
      if v_player_id is null then
        v_unresolved := v_unresolved + 1;
      else
        v_resolved := v_resolved + 1;
      end if;
    end loop;
  end loop;

  if v_expected_standings = 0 then
    raise exception 'Historical Stroke preview must contain at least one real standing';
  end if;
  if coalesce(p_validated_preview #>> '{audit,standingsParsed}', '') !~ '^\d+$'
     or (p_validated_preview #>> '{audit,standingsParsed}')::integer <> v_expected_standings
     or coalesce(p_validated_preview #>> '{audit,totalCourseAppearances}', '') !~ '^\d+$'
     or (p_validated_preview #>> '{audit,totalCourseAppearances}')::integer <> v_expected_courses
     or coalesce(p_validated_preview #>> '{audit,playedCourseAppearances}', '') !~ '^\d+$'
     or (p_validated_preview #>> '{audit,playedCourseAppearances}')::integer <> v_expected_played
     or coalesce(p_validated_preview #>> '{audit,unplayedCourseAppearances}', '') !~ '^\d+$'
     or (p_validated_preview #>> '{audit,unplayedCourseAppearances}')::integer <> v_expected_unplayed
     or coalesce(p_validated_preview #>> '{audit,negativePlayedScores}', '') !~ '^\d+$'
     or (p_validated_preview #>> '{audit,negativePlayedScores}')::integer <> v_expected_negative
     or coalesce(p_validated_preview #>> '{audit,positivePlayedScores}', '') !~ '^\d+$'
     or (p_validated_preview #>> '{audit,positivePlayedScores}')::integer <> v_expected_positive
     or coalesce(p_validated_preview #>> '{audit,numericZeroPlayedScores}', '') !~ '^\d+$'
     or (p_validated_preview #>> '{audit,numericZeroPlayedScores}')::integer <> v_expected_zero then
    raise exception 'Preview audit totals do not agree with normalized Historical Stroke records';
  end if;
  if (p_validated_preview #>> '{audit,populatedDivisions}')::integer
       <> v_expected_populated_divisions then
    raise exception 'Preview populated division count does not agree with division records';
  end if;
  if coalesce(p_validated_preview #>> '{audit,sourceRowsScanned}', '') !~ '^\d+$'
     or coalesce(p_validated_preview #>> '{audit,divisionsFound}', '') !~ '^\d+$'
     or coalesce(p_validated_preview #>> '{audit,populatedDivisions}', '') !~ '^\d+$'
     or coalesce(p_validated_preview #>> '{audit,byeRowsClassified}', '') !~ '^\d+$'
     or coalesce(p_validated_preview #>> '{audit,templateRowsClassified}', '') !~ '^\d+$'
     or coalesce(p_validated_preview #>> '{audit,malformedRealPlayerRows}', '') !~ '^\d+$'
     or coalesce(p_validated_preview #>> '{audit,leftRightConflicts}', '') !~ '^\d+$'
     or coalesce(p_validated_preview #>> '{audit,statisticalConflicts}', '') !~ '^\d+$' then
    raise exception 'Preview audit counters must be nonnegative integers';
  end if;
  if exists (
    select 1
    from jsonb_each(p_validated_preview -> 'audit') audit_item(key, value)
    where audit_item.key = any(array[
      'sourceRowsScanned', 'divisionsFound', 'populatedDivisions',
      'standingsParsed', 'byeRowsClassified', 'templateRowsClassified',
      'malformedRealPlayerRows', 'leftRightConflicts', 'statisticalConflicts',
      'totalCourseAppearances', 'playedCourseAppearances',
      'unplayedCourseAppearances', 'negativePlayedScores',
      'positivePlayedScores', 'numericZeroPlayedScores', 'historicalFixtures'
    ]) and jsonb_typeof(audit_item.value) <> 'number'
  ) then
    raise exception 'Preview audit counters must use JSON number types';
  end if;
  if (p_validated_preview #>> '{audit,sourceRowsScanned}')::integer
       <> (p_validated_preview #>> '{source,rows}')::integer
     or (p_validated_preview #>> '{audit,divisionsFound}')::integer
       <> jsonb_array_length(p_validated_preview -> 'divisions')
     or (p_validated_preview #>> '{audit,byeRowsClassified}')::integer
       <> jsonb_array_length(p_validated_preview -> 'byeRows')
     or (p_validated_preview #>> '{audit,templateRowsClassified}')::integer
       <> jsonb_array_length(p_validated_preview -> 'templateRows') then
    raise exception 'Preview structural audit totals do not agree with the source interpretation';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_validated_preview -> 'byeRows') row(value)
    where row.value ->> 'classification' is distinct from 'bye'
       or upper(coalesce(row.value ->> 'sourceName', '')) <> 'BYE'
  ) or exists (
    select 1 from jsonb_array_elements(p_validated_preview -> 'templateRows') row(value)
    where row.value ->> 'classification' is distinct from 'template'
       or coalesce(row.value ->> 'sourceName', '') <> ''
  ) then
    raise exception 'BYE or template row classifications are malformed';
  end if;

  insert into public.historical_stroke_imports (
    season_number, historical_label, historical_year, raw_header_text,
    raw_end_date_text, source_filename, source_sha256, preview_fingerprint,
    parser_version, validated_preview, source_row_count, source_column_count,
    division_count, populated_division_count, standing_count, bye_count,
    template_count, malformed_count, left_right_conflict_count,
    statistical_conflict_count, course_appearance_count,
    played_appearance_count, unplayed_appearance_count,
    negative_played_score_count, positive_played_score_count,
    numeric_zero_played_score_count, committed_by
  ) values (
    p_season_number, p_historical_label, p_historical_year,
    p_validated_preview #>> '{season,rawHeader}',
    coalesce(p_validated_preview #>> '{season,rawEndDateText}', ''),
    p_source_filename, lower(btrim(p_source_sha256)), btrim(p_preview_fingerprint),
    btrim(p_parser_version), p_validated_preview,
    (p_validated_preview #>> '{audit,sourceRowsScanned}')::integer,
    nullif(p_validated_preview #>> '{source,columnsPerRow}', '')::integer,
    (p_validated_preview #>> '{audit,divisionsFound}')::integer,
    (p_validated_preview #>> '{audit,populatedDivisions}')::integer,
    v_expected_standings,
    (p_validated_preview #>> '{audit,byeRowsClassified}')::integer,
    (p_validated_preview #>> '{audit,templateRowsClassified}')::integer,
    0, 0, 0, v_expected_courses, v_expected_played, v_expected_unplayed,
    v_expected_negative, v_expected_positive, v_expected_zero, v_user_id
  ) returning * into v_import;

  for v_division in select value from jsonb_array_elements(p_validated_preview -> 'divisions')
  loop
    v_division_number := (v_division ->> 'divisionNumber')::integer;
    for v_standing in select value from jsonb_array_elements(v_division -> 'standings')
    loop
      v_source_row := (v_standing ->> 'sourceRow')::integer;
      v_source_position := nullif(v_standing ->> 'sourcePosition', '')::integer;
      v_display_position := nullif(v_standing ->> 'sourceDisplayPosition', '')::integer;
      v_played := (v_standing ->> 'played')::integer;
      v_wins := (v_standing ->> 'wins')::integer;
      v_draws := (v_standing ->> 'draws')::integer;
      v_losses := (v_standing ->> 'losses')::integer;
      v_points := (v_standing ->> 'points')::integer;
      v_strokes := (v_standing ->> 'strokes')::integer;
      v_player_id := null;
      if nullif(v_standing ->> 'canonicalPlayerId', '') is not null then
        v_player_id := public.resolve_canonical_player_id((v_standing ->> 'canonicalPlayerId')::uuid);
      end if;
      insert into public.historical_stroke_standings (
        historical_stroke_import_id, division_number, source_row_number,
        source_position, source_display_position, historical_display_name,
        player_id, played, wins, draws, losses, points, strokes,
        identity_reviewed_at, identity_reviewed_by
      ) values (
        v_import.id, v_division_number, v_source_row, v_source_position,
        v_display_position, v_standing ->> 'historicalDisplayName', v_player_id,
        v_played, v_wins, v_draws, v_losses, v_points, v_strokes,
        case when v_player_id is null then null else now() end,
        case when v_player_id is null then null else v_user_id end
      ) returning id into v_standing_id;
      for v_course in select value from jsonb_array_elements(v_standing -> 'courses')
      loop
        insert into public.historical_stroke_course_appearances (
          historical_stroke_standing_id, course_order, historical_course_name,
          played, score, raw_score_token, win_marker, loss_marker, draw_marker, outcome
        ) values (
          v_standing_id, (v_course ->> 'courseOrder')::integer,
          v_course ->> 'courseName', (v_course ->> 'played')::boolean,
          nullif(v_course ->> 'score', '')::integer, v_course ->> 'rawScoreToken',
          (v_course ->> 'winMarker')::boolean, (v_course ->> 'lossMarker')::boolean,
          (v_course ->> 'drawMarker')::boolean, v_course ->> 'outcome'
        );
        v_inserted_courses := v_inserted_courses + 1;
      end loop;
      v_inserted_standings := v_inserted_standings + 1;
    end loop;
  end loop;
  if v_inserted_standings <> v_expected_standings or v_inserted_courses <> v_expected_courses then
    raise exception 'Inserted Historical Stroke row counts do not match the validated preview';
  end if;
  historical_stroke_import_id := v_import.id;
  idempotent := false;
  standing_count := v_inserted_standings;
  course_appearance_count := v_inserted_courses;
  resolved_identity_count := v_resolved;
  unresolved_identity_count := v_unresolved;
  return next;
end;
$function$;

create or replace function public.set_historical_stroke_standing_identity(
  p_historical_stroke_standing_id uuid,
  p_player_id uuid,
  p_resolution_note text default null
)
returns table(
  historical_stroke_standing_id uuid,
  player_id uuid,
  historical_display_name text,
  identity_reviewed_at timestamptz,
  identity_reviewed_by uuid
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_standing public.historical_stroke_standings%rowtype;
  v_canonical_id uuid;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  if p_historical_stroke_standing_id is null then
    raise exception 'Historical Stroke standing ID is required';
  end if;
  select standing.* into v_standing
  from public.historical_stroke_standings standing
  where standing.id = p_historical_stroke_standing_id for update;
  if not found then raise exception 'Historical Stroke standing was not found'; end if;
  if p_player_id is not null then
    if not exists (select 1 from public.players where id = p_player_id) then
      raise exception 'Approved player was not found';
    end if;
    v_canonical_id := public.resolve_canonical_player_id(p_player_id);
    if v_canonical_id is null or not exists (select 1 from public.players where id = v_canonical_id) then
      raise exception 'Approved player identity could not be resolved canonically';
    end if;
  end if;
  update public.historical_stroke_standings standing
  set player_id = v_canonical_id,
      identity_reviewed_at = now(),
      identity_reviewed_by = v_user_id,
      identity_resolution_note = nullif(btrim(p_resolution_note), '')
  where standing.id = v_standing.id returning standing.* into v_standing;
  return query select v_standing.id, v_standing.player_id,
    v_standing.historical_display_name, v_standing.identity_reviewed_at,
    v_standing.identity_reviewed_by;
end;
$function$;

create or replace function public.preview_historical_stroke_import_deletion(
  p_historical_stroke_import_id uuid
)
returns table(
  historical_stroke_import_id uuid,
  import_row_count integer,
  standing_count integer,
  course_appearance_count integer,
  resolved_identity_count integer,
  season_number integer,
  historical_label text,
  source_filename text
)
language plpgsql stable security definer set search_path to ''
as $function$
declare v_import public.historical_stroke_imports%rowtype;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  if p_historical_stroke_import_id is null then raise exception 'Historical Stroke import ID is required'; end if;
  select source.* into v_import from public.historical_stroke_imports source
  where source.id = p_historical_stroke_import_id;
  if not found then raise exception 'Historical Stroke import was not found'; end if;
  historical_stroke_import_id := v_import.id;
  import_row_count := 1;
  select count(*)::integer, count(*) filter (where standing.player_id is not null)::integer
  into standing_count, resolved_identity_count
  from public.historical_stroke_standings standing
  where standing.historical_stroke_import_id = v_import.id;
  select count(*)::integer into course_appearance_count
  from public.historical_stroke_course_appearances appearance
  join public.historical_stroke_standings standing
    on standing.id = appearance.historical_stroke_standing_id
  where standing.historical_stroke_import_id = v_import.id;
  season_number := v_import.season_number;
  historical_label := v_import.historical_label;
  source_filename := v_import.source_filename;
  return next;
end;
$function$;

create or replace function public.delete_historical_stroke_import(
  p_historical_stroke_import_id uuid
)
returns table(
  historical_stroke_import_id uuid,
  deleted_import_count integer,
  deleted_standing_count integer,
  deleted_course_appearance_count integer,
  resolved_identity_count integer,
  season_number integer,
  historical_label text,
  source_filename text
)
language plpgsql security definer set search_path to ''
as $function$
declare v_import public.historical_stroke_imports%rowtype;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  if p_historical_stroke_import_id is null then raise exception 'Historical Stroke import ID is required'; end if;
  select source.* into v_import from public.historical_stroke_imports source
  where source.id = p_historical_stroke_import_id for update;
  if not found then raise exception 'Historical Stroke import was not found'; end if;
  select count(*)::integer, count(*) filter (where standing.player_id is not null)::integer
  into deleted_standing_count, resolved_identity_count
  from public.historical_stroke_standings standing
  where standing.historical_stroke_import_id = v_import.id;
  select count(*)::integer into deleted_course_appearance_count
  from public.historical_stroke_course_appearances appearance
  join public.historical_stroke_standings standing
    on standing.id = appearance.historical_stroke_standing_id
  where standing.historical_stroke_import_id = v_import.id;
  delete from public.historical_stroke_imports where id = v_import.id;
  get diagnostics deleted_import_count = row_count;
  if deleted_import_count <> 1 then raise exception 'Historical Stroke deletion did not remove exactly one import'; end if;
  historical_stroke_import_id := v_import.id;
  season_number := v_import.season_number;
  historical_label := v_import.historical_label;
  source_filename := v_import.source_filename;
  return next;
end;
$function$;

revoke all on function public.commit_historical_stroke_preview(integer,text,integer,text,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.commit_historical_stroke_preview(integer,text,integer,text,text,text,text,jsonb)
  to authenticated;
revoke all on function public.set_historical_stroke_standing_identity(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.set_historical_stroke_standing_identity(uuid,uuid,text) to authenticated;
revoke all on function public.preview_historical_stroke_import_deletion(uuid)
  from public, anon, authenticated;
grant execute on function public.preview_historical_stroke_import_deletion(uuid) to authenticated;
revoke all on function public.delete_historical_stroke_import(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_historical_stroke_import(uuid) to authenticated;

-- Reruns must fail rather than accept an incompatible pre-existing object.
do $historical_stroke_foundation_check$
declare
  v_missing text;
begin
  if to_regclass('public.players') is null
     or to_regprocedure('public.is_current_user_site_admin()') is null
     or to_regprocedure('public.resolve_canonical_player_id(uuid)') is null then
    raise exception 'Historical Stroke prerequisites are missing: players and Global Identity must be installed first';
  end if;

  select string_agg(required.table_name || '.' || required.column_name, ', ' order by 1)
  into v_missing
  from (values
    ('historical_stroke_imports', 'id'),
    ('historical_stroke_imports', 'season_number'),
    ('historical_stroke_imports', 'historical_label'),
    ('historical_stroke_imports', 'historical_year'),
    ('historical_stroke_imports', 'raw_header_text'),
    ('historical_stroke_imports', 'raw_end_date_text'),
    ('historical_stroke_imports', 'source_filename'),
    ('historical_stroke_imports', 'source_sha256'),
    ('historical_stroke_imports', 'preview_fingerprint'),
    ('historical_stroke_imports', 'parser_version'),
    ('historical_stroke_imports', 'validated_preview'),
    ('historical_stroke_imports', 'standing_count'),
    ('historical_stroke_imports', 'course_appearance_count'),
    ('historical_stroke_standings', 'id'),
    ('historical_stroke_standings', 'historical_stroke_import_id'),
    ('historical_stroke_standings', 'historical_display_name'),
    ('historical_stroke_standings', 'player_id'),
    ('historical_stroke_standings', 'played'),
    ('historical_stroke_standings', 'wins'),
    ('historical_stroke_standings', 'draws'),
    ('historical_stroke_standings', 'losses'),
    ('historical_stroke_standings', 'points'),
    ('historical_stroke_standings', 'strokes'),
    ('historical_stroke_course_appearances', 'id'),
    ('historical_stroke_course_appearances', 'historical_stroke_standing_id'),
    ('historical_stroke_course_appearances', 'course_order'),
    ('historical_stroke_course_appearances', 'historical_course_name'),
    ('historical_stroke_course_appearances', 'played'),
    ('historical_stroke_course_appearances', 'score')
  ) required(table_name, column_name)
  where not exists (
    select 1 from information_schema.columns column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = required.table_name
      and column_info.column_name = required.column_name
  );
  if v_missing is not null then
    raise exception 'Incompatible Historical Stroke schema; missing columns: %', v_missing;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'historical_stroke_standings'
      and column_name = 'player_id' and is_nullable = 'YES' and data_type = 'uuid'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'historical_stroke_course_appearances'
      and column_name = 'score' and is_nullable = 'YES' and data_type = 'integer'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'historical_stroke_imports'
      and column_name = 'validated_preview' and data_type = 'jsonb'
  ) then
    raise exception 'Incompatible Historical Stroke schema; critical column types or nullability differ';
  end if;
end;
$historical_stroke_foundation_check$;

commit;
