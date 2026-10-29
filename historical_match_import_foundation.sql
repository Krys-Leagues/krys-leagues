begin;

create table if not exists public.historical_match_imports (
  id uuid primary key default gen_random_uuid(),
  season_number integer not null,
  historical_label text not null,
  historical_year integer null,
  evidence_level text not null,
  source_filename text not null,
  source_sha256 text not null,
  preview_fingerprint text not null,
  parser_version text not null,
  validated_preview jsonb not null,
  committed_at timestamptz not null default now(),
  committed_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint historical_match_imports_season_number_positive check (season_number > 0),
  constraint historical_match_imports_label_nonblank check (btrim(historical_label) <> ''),
  constraint historical_match_imports_year_positive check (historical_year is null or historical_year > 0),
  constraint historical_match_imports_evidence_level_check
    check (evidence_level in ('standings_only', 'aggregate_course')),
  constraint historical_match_imports_filename_nonblank check (btrim(source_filename) <> ''),
  constraint historical_match_imports_sha_nonblank check (btrim(source_sha256) <> ''),
  constraint historical_match_imports_sha_format
    check (source_sha256 = lower(source_sha256) and source_sha256 ~ '^[0-9a-f]{64}$'),
  constraint historical_match_imports_fingerprint_nonblank check (btrim(preview_fingerprint) <> ''),
  constraint historical_match_imports_parser_nonblank check (btrim(parser_version) <> ''),
  constraint historical_match_imports_preview_object check (jsonb_typeof(validated_preview) = 'object'),
  constraint historical_match_imports_season_key unique (season_number),
  constraint historical_match_imports_source_sha_key unique (source_sha256),
  constraint historical_match_imports_preview_fingerprint_key unique (preview_fingerprint)
);

create table if not exists public.historical_match_standings (
  id uuid primary key default gen_random_uuid(),
  historical_match_import_id uuid not null
    references public.historical_match_imports(id) on delete cascade,
  division_number integer not null,
  source_final_rank integer not null,
  historical_display_name text not null,
  canonical_player_id uuid null references public.players(id) on delete set null,
  played integer not null,
  wins integer not null,
  losses integer not null,
  draws integer not null,
  points integer not null,
  holes_won integer not null,
  source_row_number integer null,
  identity_reviewed_at timestamptz null,
  identity_reviewed_by uuid null references auth.users(id) on delete set null,
  identity_resolution_note text null,
  created_at timestamptz not null default now(),
  constraint historical_match_standings_division_positive check (division_number > 0),
  constraint historical_match_standings_rank_positive check (source_final_rank > 0),
  constraint historical_match_standings_name_nonblank check (btrim(historical_display_name) <> ''),
  constraint historical_match_standings_played_nonnegative check (played >= 0),
  constraint historical_match_standings_wins_nonnegative check (wins >= 0),
  constraint historical_match_standings_losses_nonnegative check (losses >= 0),
  constraint historical_match_standings_draws_nonnegative check (draws >= 0),
  constraint historical_match_standings_points_nonnegative check (points >= 0),
  constraint historical_match_standings_hw_nonnegative check (holes_won >= 0),
  constraint historical_match_standings_source_row_positive
    check (source_row_number is null or source_row_number > 0),
  constraint historical_match_standings_division_rank_key
    unique (historical_match_import_id, division_number, source_final_rank),
  constraint historical_match_standings_division_name_key
    unique (historical_match_import_id, division_number, historical_display_name)
);

create index if not exists historical_match_standings_canonical_player_idx
  on public.historical_match_standings(canonical_player_id)
  where canonical_player_id is not null;

create table if not exists public.historical_match_course_appearances (
  id uuid primary key default gen_random_uuid(),
  historical_match_standing_id uuid not null
    references public.historical_match_standings(id) on delete cascade,
  course_order integer not null,
  historical_course_name text not null,
  played boolean not null,
  outcome text null,
  holes_won integer null,
  source_row_number integer null,
  created_at timestamptz not null default now(),
  constraint historical_match_course_order_positive check (course_order > 0),
  constraint historical_match_course_name_nonblank check (btrim(historical_course_name) <> ''),
  constraint historical_match_course_source_row_positive
    check (source_row_number is null or source_row_number > 0),
  constraint historical_match_course_played_consistency check (
    (played and outcome in ('W', 'L', 'D') and holes_won is not null and holes_won >= 0)
    or
    (not played and outcome is null and holes_won is null)
  ),
  constraint historical_match_course_standing_order_key
    unique (historical_match_standing_id, course_order),
  constraint historical_match_course_standing_name_key
    unique (historical_match_standing_id, historical_course_name)
);

alter table public.historical_match_imports enable row level security;
alter table public.historical_match_standings enable row level security;
alter table public.historical_match_course_appearances enable row level security;

drop policy if exists "Site admins can read historical Match imports"
  on public.historical_match_imports;
create policy "Site admins can read historical Match imports"
  on public.historical_match_imports for select to authenticated
  using (public.is_current_user_site_admin());

drop policy if exists "Site admins can read historical Match standings"
  on public.historical_match_standings;
create policy "Site admins can read historical Match standings"
  on public.historical_match_standings for select to authenticated
  using (public.is_current_user_site_admin());

drop policy if exists "Site admins can read historical Match course appearances"
  on public.historical_match_course_appearances;
create policy "Site admins can read historical Match course appearances"
  on public.historical_match_course_appearances for select to authenticated
  using (public.is_current_user_site_admin());

revoke all on table public.historical_match_imports from public, anon, authenticated;
revoke all on table public.historical_match_standings from public, anon, authenticated;
revoke all on table public.historical_match_course_appearances from public, anon, authenticated;
grant select on table public.historical_match_imports to authenticated;
grant select on table public.historical_match_standings to authenticated;
grant select on table public.historical_match_course_appearances to authenticated;

create or replace function public.commit_historical_match_preview(
  p_season_number integer,
  p_historical_label text,
  p_historical_year integer,
  p_evidence_level text,
  p_source_filename text,
  p_source_sha256 text,
  p_preview_fingerprint text,
  p_parser_version text,
  p_validated_preview jsonb
)
returns table(
  historical_match_import_id uuid,
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
  v_import public.historical_match_imports%rowtype;
  v_division jsonb;
  v_standing jsonb;
  v_course jsonb;
  v_standing_id uuid;
  v_requested_player_id uuid;
  v_canonical_player_id uuid;
  v_expected_standings integer := 0;
  v_expected_courses integer := 0;
  v_expected_played_courses integer := 0;
  v_expected_unplayed_courses integer := 0;
  v_inserted_standings integer := 0;
  v_inserted_courses integer := 0;
  v_resolved integer := 0;
  v_unresolved integer := 0;
  v_division_number integer;
  v_rank integer;
  v_source_row integer;
  v_course_order integer;
  v_course_index integer;
  v_played integer;
  v_wins integer;
  v_losses integer;
  v_draws integer;
  v_points integer;
  v_holes_won integer;
  v_course_played boolean;
  v_course_hw integer;
  v_payload_year integer;
  v_duplicate_count integer;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;

  if p_season_number is null or p_season_number <= 0 then
    raise exception 'Historical Match season number must be a positive integer';
  end if;
  if p_historical_label is null or btrim(p_historical_label) = '' then
    raise exception 'Historical Match label is required';
  end if;
  if p_historical_year is not null and p_historical_year <= 0 then
    raise exception 'Historical year must be positive when supplied';
  end if;
  if p_evidence_level is null
     or p_evidence_level not in ('standings_only', 'aggregate_course') then
    raise exception 'Historical Match evidence level must be standings_only or aggregate_course';
  end if;
  if p_source_filename is null or btrim(p_source_filename) = '' then
    raise exception 'Historical Match source filename is required';
  end if;
  if p_source_sha256 is null or lower(btrim(p_source_sha256)) !~ '^[0-9a-f]{64}$' then
    raise exception 'Historical Match source SHA-256 must be 64 hexadecimal characters';
  end if;
  if p_preview_fingerprint is null or btrim(p_preview_fingerprint) = '' then
    raise exception 'Historical Match preview fingerprint is required';
  end if;
  if p_parser_version is null or btrim(p_parser_version) = '' then
    raise exception 'Historical Match parser version is required';
  end if;
  if p_validated_preview is null or jsonb_typeof(p_validated_preview) <> 'object' then
    raise exception 'Validated historical Match preview must be a JSON object';
  end if;

  -- Serialize commits for the same Match season. Unique constraints remain the
  -- final protection for source hashes and fingerprints across all seasons.
  perform pg_advisory_xact_lock(
    hashtextextended('historical_match_season:' || p_season_number::text, 0)
  );

  select source.* into v_import
  from public.historical_match_imports as source
  where source.season_number = p_season_number
  for update;

  if found then
    if v_import.source_sha256 = lower(btrim(p_source_sha256))
       and v_import.preview_fingerprint = btrim(p_preview_fingerprint) then
      historical_match_import_id := v_import.id;
      idempotent := true;
      select count(*)::integer,
             count(*) filter (where standing.canonical_player_id is not null)::integer,
             count(*) filter (where standing.canonical_player_id is null)::integer
      into standing_count, resolved_identity_count, unresolved_identity_count
      from public.historical_match_standings as standing
      where standing.historical_match_import_id = v_import.id;
      select count(*)::integer into course_appearance_count
      from public.historical_match_course_appearances as appearance
      join public.historical_match_standings as standing
        on standing.id = appearance.historical_match_standing_id
      where standing.historical_match_import_id = v_import.id;
      return next;
      return;
    end if;
    raise exception
      'Historical Match Season % already has a different committed authoritative source; delete it explicitly before reimporting',
      p_season_number;
  end if;

  if exists (
    select 1 from public.historical_match_imports as source
    where source.source_sha256 = lower(btrim(p_source_sha256))
  ) then
    raise exception 'This historical Match source SHA-256 is already committed to another season';
  end if;
  if exists (
    select 1 from public.historical_match_imports as source
    where source.preview_fingerprint = btrim(p_preview_fingerprint)
  ) then
    raise exception 'This historical Match preview fingerprint is already committed to another season';
  end if;

  if coalesce(p_validated_preview ->> 'seasonNumber', '') !~ '^\d+$'
     or (p_validated_preview ->> 'seasonNumber')::integer <> p_season_number then
    raise exception 'Preview season number does not agree with commit metadata';
  end if;
  if p_validated_preview ->> 'historicalLabel' is distinct from p_historical_label then
    raise exception 'Preview historical label does not agree with commit metadata';
  end if;
  begin
    v_payload_year := nullif(p_validated_preview ->> 'year', '')::integer;
  exception when invalid_text_representation then
    raise exception 'Preview historical year is not a valid integer or null';
  end;
  if v_payload_year is distinct from p_historical_year then
    raise exception 'Preview historical year does not agree with commit metadata';
  end if;
  if jsonb_typeof(p_validated_preview -> 'divisions') <> 'array'
     or jsonb_array_length(p_validated_preview -> 'divisions') = 0 then
    raise exception 'Preview divisions must be a nonempty array';
  end if;
  if jsonb_typeof(p_validated_preview -> 'audit') <> 'object' then
    raise exception 'Preview audit summary is required';
  end if;
  if coalesce(p_validated_preview #>> '{audit,authoritativeFixtures}', '') !~ '^\d+$'
     or (p_validated_preview #>> '{audit,authoritativeFixtures}')::integer <> 0 then
    raise exception 'This foundation accepts no historical opponent fixtures';
  end if;

  -- Validate duplicate standing keys before inserting any durable row.
  with preview_standings as (
    select
      division.value ->> 'divisionNumber' as division_number,
      standing.value ->> 'finalRank' as final_rank,
      standing.value ->> 'historicalDisplayName' as historical_display_name
    from jsonb_array_elements(p_validated_preview -> 'divisions') as division(value)
    cross join lateral jsonb_array_elements(division.value -> 'standings') as standing(value)
  ), duplicate_keys as (
    select 1
    from preview_standings
    group by division_number, final_rank
    having count(*) > 1
    union all
    select 1
    from preview_standings
    group by division_number, historical_display_name
    having count(*) > 1
  )
  select count(*)::integer into v_duplicate_count from duplicate_keys;
  if v_duplicate_count > 0 then
    raise exception 'Preview contains duplicate division/rank or division/historical-name standing keys';
  end if;

  -- Validate duplicate course keys before inserting any durable row.
  with preview_courses as (
    select
      division.value ->> 'divisionNumber' as division_number,
      standing.value ->> 'finalRank' as final_rank,
      coalesce(course.value ->> 'courseOrder', course.ordinality::text) as course_order,
      course.value ->> 'courseName' as course_name
    from jsonb_array_elements(p_validated_preview -> 'divisions') as division(value)
    cross join lateral jsonb_array_elements(division.value -> 'standings') as standing(value)
    cross join lateral jsonb_array_elements(coalesce(standing.value -> 'courses', '[]'::jsonb))
      with ordinality as course(value, ordinality)
  ), duplicate_keys as (
    select 1
    from preview_courses
    group by division_number, final_rank, course_order
    having count(*) > 1
    union all
    select 1
    from preview_courses
    group by division_number, final_rank, course_name
    having count(*) > 1
  )
  select count(*)::integer into v_duplicate_count from duplicate_keys;
  if v_duplicate_count > 0 then
    raise exception 'Preview contains duplicate course order or course name for one standing';
  end if;

  for v_division in
    select value from jsonb_array_elements(p_validated_preview -> 'divisions')
  loop
    if jsonb_typeof(v_division) <> 'object'
       or coalesce(v_division ->> 'divisionNumber', '') !~ '^\d+$'
       or (v_division ->> 'divisionNumber')::integer <= 0 then
      raise exception 'Every preview division requires a positive integer divisionNumber';
    end if;
    v_division_number := (v_division ->> 'divisionNumber')::integer;
    if jsonb_typeof(v_division -> 'standings') <> 'array' then
      raise exception 'Division % standings must be an array', v_division_number;
    end if;

    for v_standing in
      select value from jsonb_array_elements(v_division -> 'standings')
    loop
      if jsonb_typeof(v_standing) <> 'object' then
        raise exception 'Every historical Match standing must be a JSON object';
      end if;
      if coalesce(v_standing ->> 'finalRank', '') !~ '^\d+$'
         or (v_standing ->> 'finalRank')::integer <= 0 then
        raise exception 'Every standing requires a positive integer finalRank';
      end if;
      v_rank := (v_standing ->> 'finalRank')::integer;
      if v_standing ->> 'historicalDisplayName' is null
         or btrim(v_standing ->> 'historicalDisplayName') = '' then
        raise exception 'Every standing requires a frozen historical display name';
      end if;
      if coalesce(v_standing ->> 'played', '') !~ '^\d+$'
         or coalesce(v_standing ->> 'wins', '') !~ '^\d+$'
         or coalesce(v_standing ->> 'losses', '') !~ '^\d+$'
         or coalesce(v_standing ->> 'draws', '') !~ '^\d+$'
         or coalesce(v_standing ->> 'points', '') !~ '^\d+$'
         or coalesce(v_standing ->> 'holesWon', '') !~ '^\d+$' then
        raise exception 'Standing totals must be nonnegative integers for Division %, Rank %',
          v_division_number, v_rank;
      end if;
      v_played := (v_standing ->> 'played')::integer;
      v_wins := (v_standing ->> 'wins')::integer;
      v_losses := (v_standing ->> 'losses')::integer;
      v_draws := (v_standing ->> 'draws')::integer;
      v_points := (v_standing ->> 'points')::integer;
      v_holes_won := (v_standing ->> 'holesWon')::integer;

      begin
        v_source_row := nullif(v_standing ->> 'sourceRowNumber', '')::integer;
      exception when invalid_text_representation then
        raise exception 'Standing sourceRowNumber must be a positive integer or null';
      end;
      if v_source_row is not null and v_source_row <= 0 then
        raise exception 'Standing sourceRowNumber must be positive when supplied';
      end if;

      v_requested_player_id := null;
      v_canonical_player_id := null;
      if nullif(v_standing ->> 'canonicalPlayerId', '') is not null then
        begin
          v_requested_player_id := (v_standing ->> 'canonicalPlayerId')::uuid;
        exception when invalid_text_representation then
          raise exception 'Approved canonicalPlayerId is not a valid UUID for Division %, Rank %',
            v_division_number, v_rank;
        end;
        if not exists (
          select 1 from public.players as player where player.id = v_requested_player_id
        ) then
          raise exception 'Approved canonical player % does not exist', v_requested_player_id;
        end if;
        v_canonical_player_id := public.resolve_canonical_player_id(v_requested_player_id);
        if v_canonical_player_id is null or not exists (
          select 1 from public.players as player where player.id = v_canonical_player_id
        ) then
          raise exception 'Approved player identity could not be resolved canonically';
        end if;
      end if;

      if v_standing ? 'courses' and jsonb_typeof(v_standing -> 'courses') <> 'array' then
        raise exception 'Standing courses must be an array when supplied';
      end if;
      if p_evidence_level = 'standings_only'
         and jsonb_array_length(coalesce(v_standing -> 'courses', '[]'::jsonb)) <> 0 then
        raise exception 'standings_only evidence cannot contain course appearances';
      end if;

      v_expected_standings := v_expected_standings + 1;
      v_course_index := 0;
      for v_course in
        select value from jsonb_array_elements(coalesce(v_standing -> 'courses', '[]'::jsonb))
      loop
        v_course_index := v_course_index + 1;
        if jsonb_typeof(v_course) <> 'object' then
          raise exception 'Every course appearance must be a JSON object';
        end if;
        if coalesce(v_course ->> 'courseOrder', v_course_index::text) !~ '^\d+$'
           or coalesce(v_course ->> 'courseOrder', v_course_index::text)::integer <= 0 then
          raise exception 'Every course appearance requires a positive integer courseOrder';
        end if;
        if v_course ->> 'courseName' is null or btrim(v_course ->> 'courseName') = '' then
          raise exception 'Every course appearance requires a frozen course name';
        end if;
        if jsonb_typeof(v_course -> 'played') <> 'boolean' then
          raise exception 'Every course appearance requires a boolean played value';
        end if;
        v_course_played := (v_course ->> 'played')::boolean;
        if v_course_played then
          if coalesce(v_course ->> 'outcome', '') not in ('W', 'L', 'D')
             or coalesce(v_course ->> 'holesWon', '') !~ '^\d+$' then
            raise exception 'Played course appearances require W/L/D outcome and nonnegative integer HW';
          end if;
          v_expected_played_courses := v_expected_played_courses + 1;
        else
          if v_course -> 'outcome' <> 'null'::jsonb and v_course ? 'outcome' then
            raise exception 'Unplayed course appearances must have null outcome';
          end if;
          if v_course -> 'holesWon' <> 'null'::jsonb and v_course ? 'holesWon' then
            raise exception 'Unplayed course appearances must have null HW';
          end if;
          v_expected_unplayed_courses := v_expected_unplayed_courses + 1;
        end if;
        v_expected_courses := v_expected_courses + 1;
      end loop;
    end loop;
  end loop;

  if v_expected_standings = 0 then
    raise exception 'Historical Match preview contains no standings';
  end if;
  if p_evidence_level = 'aggregate_course' and v_expected_courses = 0 then
    raise exception 'aggregate_course evidence requires at least one course appearance';
  end if;
  if coalesce(p_validated_preview #>> '{audit,realPlayerRows}', '') !~ '^\d+$'
     or (p_validated_preview #>> '{audit,realPlayerRows}')::integer <> v_expected_standings then
    raise exception 'Preview audit standing count does not match preview payload';
  end if;
  if coalesce(p_validated_preview #>> '{audit,courseAppearancesPlayed}', '') !~ '^\d+$'
     or (p_validated_preview #>> '{audit,courseAppearancesPlayed}')::integer <> v_expected_played_courses
     or coalesce(p_validated_preview #>> '{audit,courseAppearancesUnplayed}', '') !~ '^\d+$'
     or (p_validated_preview #>> '{audit,courseAppearancesUnplayed}')::integer <> v_expected_unplayed_courses then
    raise exception 'Preview audit course-appearance counts do not match preview payload';
  end if;

  insert into public.historical_match_imports (
    season_number, historical_label, historical_year, evidence_level,
    source_filename, source_sha256, preview_fingerprint, parser_version,
    validated_preview, committed_by
  ) values (
    p_season_number, p_historical_label, p_historical_year, p_evidence_level,
    btrim(p_source_filename), lower(btrim(p_source_sha256)), btrim(p_preview_fingerprint),
    btrim(p_parser_version), p_validated_preview, v_user_id
  )
  returning * into v_import;

  for v_division in
    select value from jsonb_array_elements(p_validated_preview -> 'divisions')
  loop
    v_division_number := (v_division ->> 'divisionNumber')::integer;
    for v_standing in
      select value from jsonb_array_elements(v_division -> 'standings')
    loop
      v_rank := (v_standing ->> 'finalRank')::integer;
      v_requested_player_id := nullif(v_standing ->> 'canonicalPlayerId', '')::uuid;
      v_canonical_player_id := case
        when v_requested_player_id is null then null
        else public.resolve_canonical_player_id(v_requested_player_id)
      end;
      v_source_row := nullif(v_standing ->> 'sourceRowNumber', '')::integer;

      insert into public.historical_match_standings (
        historical_match_import_id, division_number, source_final_rank,
        historical_display_name, canonical_player_id, played, wins, losses,
        draws, points, holes_won, source_row_number, identity_reviewed_at,
        identity_reviewed_by, identity_resolution_note
      ) values (
        v_import.id, v_division_number, v_rank,
        v_standing ->> 'historicalDisplayName', v_canonical_player_id,
        (v_standing ->> 'played')::integer, (v_standing ->> 'wins')::integer,
        (v_standing ->> 'losses')::integer, (v_standing ->> 'draws')::integer,
        (v_standing ->> 'points')::integer, (v_standing ->> 'holesWon')::integer,
        v_source_row,
        case when v_canonical_player_id is null then null else now() end,
        case when v_canonical_player_id is null then null else v_user_id end,
        case when v_canonical_player_id is null then null
             else nullif(btrim(v_standing ->> 'identityResolutionNote'), '') end
      ) returning id into v_standing_id;

      v_inserted_standings := v_inserted_standings + 1;
      if v_canonical_player_id is null then
        v_unresolved := v_unresolved + 1;
      else
        v_resolved := v_resolved + 1;
      end if;

      v_course_index := 0;
      for v_course in
        select value from jsonb_array_elements(coalesce(v_standing -> 'courses', '[]'::jsonb))
      loop
        v_course_index := v_course_index + 1;
        v_course_order := coalesce(v_course ->> 'courseOrder', v_course_index::text)::integer;
        v_course_played := (v_course ->> 'played')::boolean;
        v_course_hw := case when v_course_played then (v_course ->> 'holesWon')::integer else null end;
        begin
          v_source_row := nullif(v_course ->> 'sourceRowNumber', '')::integer;
        exception when invalid_text_representation then
          raise exception 'Course sourceRowNumber must be a positive integer or null';
        end;
        if v_source_row is not null and v_source_row <= 0 then
          raise exception 'Course sourceRowNumber must be positive when supplied';
        end if;

        insert into public.historical_match_course_appearances (
          historical_match_standing_id, course_order, historical_course_name,
          played, outcome, holes_won, source_row_number
        ) values (
          v_standing_id, v_course_order, v_course ->> 'courseName',
          v_course_played,
          case when v_course_played then v_course ->> 'outcome' else null end,
          v_course_hw, v_source_row
        );
        v_inserted_courses := v_inserted_courses + 1;
      end loop;
    end loop;
  end loop;

  if v_inserted_standings <> v_expected_standings
     or v_inserted_courses <> v_expected_courses then
    raise exception 'Historical Match insert counts do not match the validated preview';
  end if;

  historical_match_import_id := v_import.id;
  idempotent := false;
  standing_count := v_inserted_standings;
  course_appearance_count := v_inserted_courses;
  resolved_identity_count := v_resolved;
  unresolved_identity_count := v_unresolved;
  return next;
end;
$function$;

create or replace function public.set_historical_match_standing_identity(
  p_historical_match_standing_id uuid,
  p_approved_player_id uuid,
  p_resolution_note text default null
)
returns table(
  historical_match_standing_id uuid,
  canonical_player_id uuid,
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
  v_standing public.historical_match_standings%rowtype;
  v_canonical_id uuid;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  if p_historical_match_standing_id is null then
    raise exception 'Historical Match standing ID is required';
  end if;

  select standing.* into v_standing
  from public.historical_match_standings as standing
  where standing.id = p_historical_match_standing_id
  for update;
  if not found then
    raise exception 'Historical Match standing was not found';
  end if;

  if p_approved_player_id is not null then
    if not exists (select 1 from public.players as player where player.id = p_approved_player_id) then
      raise exception 'Approved player was not found';
    end if;
    v_canonical_id := public.resolve_canonical_player_id(p_approved_player_id);
    if v_canonical_id is null
       or not exists (select 1 from public.players as player where player.id = v_canonical_id) then
      raise exception 'Approved player identity could not be resolved canonically';
    end if;
  else
    v_canonical_id := null;
  end if;

  update public.historical_match_standings as standing
  set canonical_player_id = v_canonical_id,
      identity_reviewed_at = now(),
      identity_reviewed_by = v_user_id,
      identity_resolution_note = nullif(btrim(p_resolution_note), '')
  where standing.id = v_standing.id
  returning standing.* into v_standing;

  return query select
    v_standing.id,
    v_standing.canonical_player_id,
    v_standing.historical_display_name,
    v_standing.identity_reviewed_at,
    v_standing.identity_reviewed_by;
end;
$function$;

create or replace function public.preview_historical_match_import_deletion(
  p_historical_match_import_id uuid
)
returns table(
  historical_match_import_id uuid,
  import_row_count integer,
  standing_count integer,
  course_appearance_count integer,
  resolved_identity_count integer,
  season_number integer,
  historical_label text,
  source_filename text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_import public.historical_match_imports%rowtype;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  if p_historical_match_import_id is null then
    raise exception 'Historical Match import ID is required';
  end if;

  select source.* into v_import
  from public.historical_match_imports as source
  where source.id = p_historical_match_import_id;
  if not found then
    raise exception 'Historical Match import was not found';
  end if;

  historical_match_import_id := v_import.id;
  import_row_count := 1;
  select count(*)::integer,
         count(*) filter (where standing.canonical_player_id is not null)::integer
  into standing_count, resolved_identity_count
  from public.historical_match_standings as standing
  where standing.historical_match_import_id = v_import.id;
  select count(*)::integer into course_appearance_count
  from public.historical_match_course_appearances as appearance
  join public.historical_match_standings as standing
    on standing.id = appearance.historical_match_standing_id
  where standing.historical_match_import_id = v_import.id;
  season_number := v_import.season_number;
  historical_label := v_import.historical_label;
  source_filename := v_import.source_filename;
  return next;
end;
$function$;

create or replace function public.delete_historical_match_import(
  p_historical_match_import_id uuid
)
returns table(
  historical_match_import_id uuid,
  deleted_import_count integer,
  deleted_standing_count integer,
  deleted_course_appearance_count integer,
  resolved_identity_count integer,
  season_number integer,
  historical_label text,
  source_filename text
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_import public.historical_match_imports%rowtype;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  if p_historical_match_import_id is null then
    raise exception 'Historical Match import ID is required';
  end if;

  select source.* into v_import
  from public.historical_match_imports as source
  where source.id = p_historical_match_import_id
  for update;
  if not found then
    raise exception 'Historical Match import was not found';
  end if;

  select count(*)::integer,
         count(*) filter (where standing.canonical_player_id is not null)::integer
  into deleted_standing_count, resolved_identity_count
  from public.historical_match_standings as standing
  where standing.historical_match_import_id = v_import.id;
  select count(*)::integer into deleted_course_appearance_count
  from public.historical_match_course_appearances as appearance
  join public.historical_match_standings as standing
    on standing.id = appearance.historical_match_standing_id
  where standing.historical_match_import_id = v_import.id;

  delete from public.historical_match_imports as source
  where source.id = v_import.id;
  get diagnostics deleted_import_count = row_count;
  if deleted_import_count <> 1 then
    raise exception 'Historical Match import deletion did not remove exactly one parent row';
  end if;

  historical_match_import_id := v_import.id;
  season_number := v_import.season_number;
  historical_label := v_import.historical_label;
  source_filename := v_import.source_filename;
  return next;
end;
$function$;

revoke all on function public.commit_historical_match_preview(integer,text,integer,text,text,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.commit_historical_match_preview(integer,text,integer,text,text,text,text,text,jsonb)
  to authenticated;

revoke all on function public.set_historical_match_standing_identity(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.set_historical_match_standing_identity(uuid,uuid,text)
  to authenticated;

revoke all on function public.preview_historical_match_import_deletion(uuid)
  from public, anon, authenticated;
grant execute on function public.preview_historical_match_import_deletion(uuid)
  to authenticated;

revoke all on function public.delete_historical_match_import(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_historical_match_import(uuid)
  to authenticated;

-- Definition-only installation checks. These inspect catalogs and create no data.
do $historical_match_foundation_check$
declare
  v_missing text;
  v_missing_columns text;
  v_bad_fk text;
begin
  select string_agg(required.name, ', ' order by required.name)
  into v_missing
  from (values
    ('historical_match_imports'),
    ('historical_match_standings'),
    ('historical_match_course_appearances')
  ) as required(name)
  where to_regclass('public.' || required.name) is null;
  if v_missing is not null then
    raise exception 'Historical Match foundation is missing tables: %', v_missing;
  end if;

  with required_columns(table_name, column_name) as (
    values
      ('historical_match_imports', 'id'),
      ('historical_match_imports', 'season_number'),
      ('historical_match_imports', 'historical_label'),
      ('historical_match_imports', 'historical_year'),
      ('historical_match_imports', 'evidence_level'),
      ('historical_match_imports', 'source_filename'),
      ('historical_match_imports', 'source_sha256'),
      ('historical_match_imports', 'preview_fingerprint'),
      ('historical_match_imports', 'parser_version'),
      ('historical_match_imports', 'validated_preview'),
      ('historical_match_imports', 'committed_at'),
      ('historical_match_imports', 'committed_by'),
      ('historical_match_standings', 'historical_match_import_id'),
      ('historical_match_standings', 'division_number'),
      ('historical_match_standings', 'source_final_rank'),
      ('historical_match_standings', 'historical_display_name'),
      ('historical_match_standings', 'canonical_player_id'),
      ('historical_match_standings', 'played'),
      ('historical_match_standings', 'wins'),
      ('historical_match_standings', 'losses'),
      ('historical_match_standings', 'draws'),
      ('historical_match_standings', 'points'),
      ('historical_match_standings', 'holes_won'),
      ('historical_match_course_appearances', 'historical_match_standing_id'),
      ('historical_match_course_appearances', 'course_order'),
      ('historical_match_course_appearances', 'historical_course_name'),
      ('historical_match_course_appearances', 'played'),
      ('historical_match_course_appearances', 'outcome'),
      ('historical_match_course_appearances', 'holes_won')
  )
  select string_agg(required.table_name || '.' || required.column_name, ', ' order by required.table_name, required.column_name)
  into v_missing_columns
  from required_columns as required
  left join information_schema.columns as actual
    on actual.table_schema = 'public'
    and actual.table_name = required.table_name
    and actual.column_name = required.column_name
  where actual.column_name is null;
  if v_missing_columns is not null then
    raise exception 'Historical Match foundation is missing columns: %', v_missing_columns;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'historical_match_imports_season_key'
      and conrelid = 'public.historical_match_imports'::regclass
  ) or not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'historical_match_imports_source_sha_key'
      and conrelid = 'public.historical_match_imports'::regclass
  ) or not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'historical_match_imports_preview_fingerprint_key'
      and conrelid = 'public.historical_match_imports'::regclass
  ) or not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'historical_match_course_played_consistency'
      and conrelid = 'public.historical_match_course_appearances'::regclass
  ) then
    raise exception 'Historical Match foundation is missing an idempotency or course-consistency constraint';
  end if;

  if to_regprocedure('public.commit_historical_match_preview(integer,text,integer,text,text,text,text,text,jsonb)') is null
     or to_regprocedure('public.set_historical_match_standing_identity(uuid,uuid,text)') is null
     or to_regprocedure('public.preview_historical_match_import_deletion(uuid)') is null
     or to_regprocedure('public.delete_historical_match_import(uuid)') is null then
    raise exception 'Historical Match foundation is missing one or more required RPCs';
  end if;

  select string_agg(source.relname || ' -> ' || target.relname, ', ')
  into v_bad_fk
  from pg_catalog.pg_constraint as foreign_key
  join pg_catalog.pg_class as source on source.oid = foreign_key.conrelid
  join pg_catalog.pg_class as target on target.oid = foreign_key.confrelid
  join pg_catalog.pg_namespace as source_namespace on source_namespace.oid = source.relnamespace
  where foreign_key.contype = 'f'
    and source_namespace.nspname = 'public'
    and source.relname in (
      'historical_match_imports',
      'historical_match_standings',
      'historical_match_course_appearances'
    )
    and target.relname in (
      'seasons', 'match_roster_versions', 'match_division_roster_slots',
      'match_division_course_overrides', 'match_schedule_state', 'schedule',
      'results', 'season_standings', 'match_final_scorecards',
      'match_final_scorecard_entries', 'match_final_scorecard_player_decisions'
    );
  if v_bad_fk is not null then
    raise exception 'Historical Match foundation has forbidden managed Match foreign keys: %', v_bad_fk;
  end if;
end;
$historical_match_foundation_check$;

commit;
