begin;

-- Historical Match fixture-detail extension. This file deliberately references
-- only the isolated historical Match tables and RPCs.

alter table public.historical_match_imports
  drop constraint historical_match_imports_evidence_level_check;
alter table public.historical_match_imports
  add constraint historical_match_imports_evidence_level_check
  check (evidence_level in ('standings_only', 'aggregate_course', 'fixture_detailed'));

-- These columns form the ownership key used by both participant foreign keys.
create unique index if not exists historical_match_standings_id_import_division_key
  on public.historical_match_standings(id, historical_match_import_id, division_number);

create table public.historical_match_fixtures (
  id uuid primary key default gen_random_uuid(),
  historical_match_import_id uuid not null
    references public.historical_match_imports(id) on delete cascade,
  division_number integer not null,
  course_order integer not null,
  historical_course_name text not null,
  player1_standing_id uuid not null,
  player2_standing_id uuid not null,
  played boolean not null,
  player1_holes_won integer null,
  player2_holes_won integer null,
  source_reference text null,
  created_at timestamptz not null default now(),
  constraint historical_match_fixtures_division_positive check (division_number > 0),
  constraint historical_match_fixtures_course_order_positive check (course_order > 0),
  constraint historical_match_fixtures_course_name_nonblank
    check (btrim(historical_course_name) <> ''),
  constraint historical_match_fixtures_distinct_players
    check (player1_standing_id <> player2_standing_id),
  constraint historical_match_fixtures_played_consistency check (
    (played and player1_holes_won is not null and player1_holes_won >= 0
            and player2_holes_won is not null and player2_holes_won >= 0)
    or
    (not played and player1_holes_won is null and player2_holes_won is null)
  ),
  constraint historical_match_fixtures_player1_owner_fk
    foreign key (player1_standing_id, historical_match_import_id, division_number)
    references public.historical_match_standings
      (id, historical_match_import_id, division_number) on delete cascade,
  constraint historical_match_fixtures_player2_owner_fk
    foreign key (player2_standing_id, historical_match_import_id, division_number)
    references public.historical_match_standings
      (id, historical_match_import_id, division_number) on delete cascade
);

create unique index historical_match_fixtures_unordered_pair_key
  on public.historical_match_fixtures(
    historical_match_import_id, division_number, course_order,
    least(player1_standing_id, player2_standing_id),
    greatest(player1_standing_id, player2_standing_id)
  );

create or replace function public.enforce_historical_match_fixture_participation()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- Serialize fixture writes for one import/division/round before checking the
  -- cross-column one-player-per-round invariant.
  perform pg_advisory_xact_lock(hashtextextended(
    'historical_match_fixture:' || new.historical_match_import_id::text || ':' ||
    new.division_number::text || ':' || new.course_order::text, 0
  ));
  if exists (
    select 1
    from public.historical_match_fixtures as fixture
    where fixture.historical_match_import_id = new.historical_match_import_id
      and fixture.division_number = new.division_number
      and fixture.course_order = new.course_order
      and fixture.id <> new.id
      and (fixture.player1_standing_id in (new.player1_standing_id, new.player2_standing_id)
        or fixture.player2_standing_id in (new.player1_standing_id, new.player2_standing_id))
  ) then
    raise exception 'A historical standing may participate only once per course/round';
  end if;
  return new;
end;
$function$;

create trigger enforce_historical_match_fixture_participation
before insert or update on public.historical_match_fixtures
for each row execute function public.enforce_historical_match_fixture_participation();

alter table public.historical_match_fixtures enable row level security;
create policy "Site admins can read historical Match fixtures"
  on public.historical_match_fixtures for select to authenticated
  using (public.is_current_user_site_admin());
revoke all on table public.historical_match_fixtures from public, anon, authenticated;
grant select on table public.historical_match_fixtures to authenticated;
revoke all on function public.enforce_historical_match_fixture_participation()
  from public, anon, authenticated;

-- Preserve the installed, proven standings/aggregate implementation behind an
-- internal name. The public wrapper below retains the exact client signature.
alter function public.commit_historical_match_preview(
  integer,text,integer,text,text,text,text,text,jsonb
) rename to commit_historical_match_preview_without_fixtures_v1;
revoke all on function public.commit_historical_match_preview_without_fixtures_v1(
  integer,text,integer,text,text,text,text,text,jsonb
) from public, anon, authenticated;

create function public.commit_historical_match_preview(
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
  v_fixture jsonb;
  v_fixture_count integer := 0;
  v_duplicate_count integer;
  v_bad_count integer;
  v_derived_preview jsonb;
  v_result record;
  v_existing public.historical_match_imports%rowtype;
  v_player1_outcome text;
  v_player2_outcome text;
begin
  if p_evidence_level <> 'fixture_detailed' then
    if p_evidence_level is null or p_evidence_level not in ('standings_only', 'aggregate_course') then
      raise exception 'Historical Match evidence level must be standings_only, aggregate_course, or fixture_detailed';
    end if;
    return query select * from public.commit_historical_match_preview_without_fixtures_v1(
      p_season_number, p_historical_label, p_historical_year, p_evidence_level,
      p_source_filename, p_source_sha256, p_preview_fingerprint,
      p_parser_version, p_validated_preview
    );
    return;
  end if;

  if auth.uid() is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  if p_validated_preview is null or jsonb_typeof(p_validated_preview) <> 'object'
     or jsonb_typeof(p_validated_preview -> 'fixtures') <> 'array' then
    raise exception 'fixture_detailed preview requires a fixtures array';
  end if;
  v_fixture_count := jsonb_array_length(p_validated_preview -> 'fixtures');
  if v_fixture_count = 0 then
    raise exception 'fixture_detailed evidence requires at least one authoritative fixture';
  end if;
  if coalesce(p_validated_preview #>> '{audit,authoritativeFixtures}', '') !~ '^\d+$'
     or (p_validated_preview #>> '{audit,authoritativeFixtures}')::integer <> v_fixture_count then
    raise exception 'Preview audit fixture count does not match fixture payload';
  end if;

  -- Validate scalar fixture facts before any casts are performed below.
  for v_fixture in select value from jsonb_array_elements(p_validated_preview -> 'fixtures')
  loop
    if jsonb_typeof(v_fixture) <> 'object'
       or coalesce(v_fixture ->> 'divisionNumber', '') !~ '^\d+$'
       or (v_fixture ->> 'divisionNumber')::integer <= 0
       or coalesce(v_fixture ->> 'courseOrder', '') !~ '^\d+$'
       or (v_fixture ->> 'courseOrder')::integer <= 0
       or nullif(btrim(v_fixture ->> 'courseName'), '') is null
       or coalesce(v_fixture ->> 'player1FinalRank', '') !~ '^\d+$'
       or (v_fixture ->> 'player1FinalRank')::integer <= 0
       or coalesce(v_fixture ->> 'player2FinalRank', '') !~ '^\d+$'
       or (v_fixture ->> 'player2FinalRank')::integer <= 0
       or (v_fixture ->> 'player1FinalRank')::integer = (v_fixture ->> 'player2FinalRank')::integer
       or jsonb_typeof(v_fixture -> 'played') <> 'boolean' then
      raise exception 'Every fixture requires valid division, course, distinct final ranks, and played fields';
    end if;
    if (v_fixture ->> 'played')::boolean then
      if coalesce(v_fixture ->> 'player1HolesWon', '') !~ '^\d+$'
         or coalesce(v_fixture ->> 'player2HolesWon', '') !~ '^\d+$' then
        raise exception 'Played fixtures require two nonnegative integer HW values';
      end if;
      if (v_fixture ->> 'player1HolesWon')::integer > (v_fixture ->> 'player2HolesWon')::integer then
        v_player1_outcome := 'W';
        v_player2_outcome := 'L';
      elsif (v_fixture ->> 'player1HolesWon')::integer < (v_fixture ->> 'player2HolesWon')::integer then
        v_player1_outcome := 'L';
        v_player2_outcome := 'W';
      else
        v_player1_outcome := 'D';
        v_player2_outcome := 'D';
      end if;
      if (nullif(v_fixture ->> 'player1Outcome', '') is not null
          and v_fixture ->> 'player1Outcome' is distinct from v_player1_outcome)
         or (nullif(v_fixture ->> 'player2Outcome', '') is not null
          and v_fixture ->> 'player2Outcome' is distinct from v_player2_outcome) then
        raise exception 'Source-supplied fixture outcome conflicts with authoritative HW';
      end if;
    elsif (v_fixture ? 'player1HolesWon' and v_fixture -> 'player1HolesWon' <> 'null'::jsonb)
       or (v_fixture ? 'player2HolesWon' and v_fixture -> 'player2HolesWon' <> 'null'::jsonb) then
      raise exception 'Unplayed fixtures require two null HW values';
    end if;
  end loop;

  with fixtures as (
    select (value ->> 'divisionNumber')::integer division_number,
           (value ->> 'courseOrder')::integer course_order,
           value ->> 'courseName' course_name,
           (value ->> 'player1FinalRank')::integer p1,
           (value ->> 'player2FinalRank')::integer p2
    from jsonb_array_elements(p_validated_preview -> 'fixtures')
  ), problems as (
    select 1 from fixtures group by division_number, course_order, least(p1,p2), greatest(p1,p2)
      having count(*) > 1
    union all
    select 1 from (
      select division_number, course_order, p1 player_rank from fixtures
      union all select division_number, course_order, p2 from fixtures
    ) participants group by division_number, course_order, player_rank having count(*) > 1
    union all
    select 1 from fixtures group by division_number, course_order having count(distinct course_name) > 1
    union all
    select 1 from fixtures group by division_number, course_name having count(distinct course_order) > 1
  ) select count(*)::integer into v_duplicate_count from problems;
  if v_duplicate_count > 0 then
    raise exception 'Fixture payload contains duplicate participation or contradictory course identity';
  end if;

  -- Every participant key must resolve to exactly one frozen standing in the
  -- same division. Division + source final rank is already unique in storage.
  with standings as (
    select (division.value ->> 'divisionNumber')::integer division_number,
           (standing.value ->> 'finalRank')::integer final_rank
    from jsonb_array_elements(p_validated_preview -> 'divisions') division(value)
    cross join lateral jsonb_array_elements(division.value -> 'standings') standing(value)
  ), participants as (
    select (value ->> 'divisionNumber')::integer division_number,
           (value ->> 'player1FinalRank')::integer final_rank
    from jsonb_array_elements(p_validated_preview -> 'fixtures')
    union all
    select (value ->> 'divisionNumber')::integer,
           (value ->> 'player2FinalRank')::integer
    from jsonb_array_elements(p_validated_preview -> 'fixtures')
  )
  select count(*)::integer into v_bad_count
  from participants p left join standings s using (division_number, final_rank)
  where s.final_rank is null;
  if v_bad_count > 0 then
    raise exception 'Every fixture participant must exist in its payload division';
  end if;

  -- Fixture facts are the sole detailed scoring model. Derive a course
  -- appearance for each side and compare played-only derived totals with the
  -- frozen standing totals before invoking the existing atomic inserter.
  with standings as (
    select (division.value ->> 'divisionNumber')::integer division_number,
           (standing.value ->> 'finalRank')::integer final_rank,
           standing.value standing
    from jsonb_array_elements(p_validated_preview -> 'divisions') division(value)
    cross join lateral jsonb_array_elements(division.value -> 'standings') standing(value)
  ), sides as (
    select (f.value ->> 'divisionNumber')::integer division_number,
           (f.value ->> 'player1FinalRank')::integer final_rank,
           (f.value ->> 'played')::boolean played,
           case when (f.value ->> 'played')::boolean then (f.value ->> 'player1HolesWon')::integer end hw,
           case when not (f.value ->> 'played')::boolean then null
                when (f.value ->> 'player1HolesWon')::integer > (f.value ->> 'player2HolesWon')::integer then 'W'
                when (f.value ->> 'player1HolesWon')::integer < (f.value ->> 'player2HolesWon')::integer then 'L' else 'D' end outcome
    from jsonb_array_elements(p_validated_preview -> 'fixtures') f(value)
    union all
    select (f.value ->> 'divisionNumber')::integer,
           (f.value ->> 'player2FinalRank')::integer,
           (f.value ->> 'played')::boolean,
           case when (f.value ->> 'played')::boolean then (f.value ->> 'player2HolesWon')::integer end,
           case when not (f.value ->> 'played')::boolean then null
                when (f.value ->> 'player2HolesWon')::integer > (f.value ->> 'player1HolesWon')::integer then 'W'
                when (f.value ->> 'player2HolesWon')::integer < (f.value ->> 'player1HolesWon')::integer then 'L' else 'D' end
    from jsonb_array_elements(p_validated_preview -> 'fixtures') f(value)
  ), totals as (
    select division_number, final_rank,
      count(*) filter (where played)::integer played,
      count(*) filter (where played and outcome='W')::integer wins,
      count(*) filter (where played and outcome='L')::integer losses,
      count(*) filter (where played and outcome='D')::integer draws,
      (count(*) filter (where played and outcome='W') * 3 + count(*) filter (where played and outcome='D'))::integer points,
      coalesce(sum(hw) filter (where played),0)::integer holes_won
    from sides group by division_number, final_rank
  )
  select count(*)::integer into v_bad_count
  from standings s left join totals t using (division_number, final_rank)
  where coalesce(t.played,0) <> (s.standing ->> 'played')::integer
     or coalesce(t.wins,0) <> (s.standing ->> 'wins')::integer
     or coalesce(t.losses,0) <> (s.standing ->> 'losses')::integer
     or coalesce(t.draws,0) <> (s.standing ->> 'draws')::integer
     or coalesce(t.points,0) <> (s.standing ->> 'points')::integer
     or coalesce(t.holes_won,0) <> (s.standing ->> 'holesWon')::integer;
  if v_bad_count > 0 then
    raise exception 'Fixture-derived P/W/L/D/PTS/HW do not reconcile with standing totals';
  end if;

  with rebuilt_divisions as (
    select division.ordinality,
      jsonb_set(division.value, '{standings}', coalesce((
        select jsonb_agg(jsonb_set(standing.value, '{courses}', coalesce((
          select jsonb_agg(jsonb_build_object(
            'courseOrder', (f.value ->> 'courseOrder')::integer,
            'courseName', f.value ->> 'courseName',
            'played', (f.value ->> 'played')::boolean,
            'outcome', case when not (f.value ->> 'played')::boolean then null
              when (standing.value ->> 'finalRank')::integer = (f.value ->> 'player1FinalRank')::integer then
                case when (f.value ->> 'player1HolesWon')::integer > (f.value ->> 'player2HolesWon')::integer then 'W'
                     when (f.value ->> 'player1HolesWon')::integer < (f.value ->> 'player2HolesWon')::integer then 'L' else 'D' end
              else case when (f.value ->> 'player2HolesWon')::integer > (f.value ->> 'player1HolesWon')::integer then 'W'
                     when (f.value ->> 'player2HolesWon')::integer < (f.value ->> 'player1HolesWon')::integer then 'L' else 'D' end end,
            'holesWon', case when not (f.value ->> 'played')::boolean then null
              when (standing.value ->> 'finalRank')::integer = (f.value ->> 'player1FinalRank')::integer
                then (f.value ->> 'player1HolesWon')::integer else (f.value ->> 'player2HolesWon')::integer end
          ) order by (f.value ->> 'courseOrder')::integer)
          from jsonb_array_elements(p_validated_preview -> 'fixtures') f(value)
          where (f.value ->> 'divisionNumber')::integer = (division.value ->> 'divisionNumber')::integer
            and (standing.value ->> 'finalRank')::integer in (
              (f.value ->> 'player1FinalRank')::integer, (f.value ->> 'player2FinalRank')::integer)
        ), '[]'::jsonb), true) order by standing.ordinality)
        from jsonb_array_elements(division.value -> 'standings') with ordinality standing(value, ordinality)
      ), '[]'::jsonb), true) value
    from jsonb_array_elements(p_validated_preview -> 'divisions') with ordinality division(value, ordinality)
  )
  select jsonb_set(jsonb_set(p_validated_preview, '{divisions}', jsonb_agg(value order by ordinality), true),
    '{audit}', (p_validated_preview -> 'audit') || jsonb_build_object(
      'authoritativeFixtures', 0,
      'courseAppearancesPlayed', (select count(*) * 2 from jsonb_array_elements(p_validated_preview -> 'fixtures') f(value) where (f.value ->> 'played')::boolean),
      'courseAppearancesUnplayed', (select count(*) * 2 from jsonb_array_elements(p_validated_preview -> 'fixtures') f(value) where not (f.value ->> 'played')::boolean)
    ), true)
  into v_derived_preview from rebuilt_divisions;

  select * into v_result
  from public.commit_historical_match_preview_without_fixtures_v1(
    p_season_number, p_historical_label, p_historical_year, 'aggregate_course',
    p_source_filename, p_source_sha256, p_preview_fingerprint, p_parser_version, v_derived_preview
  );

  select * into v_existing from public.historical_match_imports where id = v_result.historical_match_import_id for update;
  if v_result.idempotent then
    if v_existing.evidence_level <> 'fixture_detailed'
       or (select count(*) from public.historical_match_fixtures where historical_match_import_id = v_existing.id) <> v_fixture_count then
      raise exception 'Existing idempotent source does not contain the expected fixture detail';
    end if;
  else
    update public.historical_match_imports
      set evidence_level = 'fixture_detailed', validated_preview = p_validated_preview
      where id = v_existing.id;

    insert into public.historical_match_fixtures(
      historical_match_import_id, division_number, course_order, historical_course_name,
      player1_standing_id, player2_standing_id, played,
      player1_holes_won, player2_holes_won, source_reference
    )
    select v_existing.id, (f.value ->> 'divisionNumber')::integer,
      (f.value ->> 'courseOrder')::integer, f.value ->> 'courseName', p1.id, p2.id,
      (f.value ->> 'played')::boolean,
      case when (f.value ->> 'played')::boolean then (f.value ->> 'player1HolesWon')::integer end,
      case when (f.value ->> 'played')::boolean then (f.value ->> 'player2HolesWon')::integer end,
      nullif(btrim(f.value ->> 'sourceReference'), '')
    from jsonb_array_elements(p_validated_preview -> 'fixtures') f(value)
    join public.historical_match_standings p1
      on p1.historical_match_import_id = v_existing.id
     and p1.division_number = (f.value ->> 'divisionNumber')::integer
     and p1.source_final_rank = (f.value ->> 'player1FinalRank')::integer
    join public.historical_match_standings p2
      on p2.historical_match_import_id = v_existing.id
     and p2.division_number = (f.value ->> 'divisionNumber')::integer
     and p2.source_final_rank = (f.value ->> 'player2FinalRank')::integer;
  end if;

  historical_match_import_id := v_result.historical_match_import_id;
  idempotent := v_result.idempotent;
  standing_count := v_result.standing_count;
  course_appearance_count := v_result.course_appearance_count;
  resolved_identity_count := v_result.resolved_identity_count;
  unresolved_identity_count := v_result.unresolved_identity_count;
  return next;
end;
$function$;

revoke all on function public.commit_historical_match_preview(
  integer,text,integer,text,text,text,text,text,jsonb
) from public, anon, authenticated;
grant execute on function public.commit_historical_match_preview(
  integer,text,integer,text,text,text,text,text,jsonb
) to authenticated;

-- Return types gain fixture counts, so these two functions must be recreated.
drop function public.preview_historical_match_import_deletion(uuid);
create function public.preview_historical_match_import_deletion(p_historical_match_import_id uuid)
returns table(
  historical_match_import_id uuid, import_row_count integer, standing_count integer,
  course_appearance_count integer, fixture_count integer, resolved_identity_count integer,
  season_number integer, historical_label text, source_filename text
)
language plpgsql stable security definer set search_path to ''
as $function$
declare v_import public.historical_match_imports%rowtype;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  select * into v_import from public.historical_match_imports where id = p_historical_match_import_id;
  if not found then raise exception 'Historical Match import was not found'; end if;
  historical_match_import_id := v_import.id; import_row_count := 1;
  select count(*)::integer, count(*) filter (where s.canonical_player_id is not null)::integer
    into standing_count, resolved_identity_count from public.historical_match_standings s
    where s.historical_match_import_id = v_import.id;
  select count(*)::integer into course_appearance_count
    from public.historical_match_course_appearances a join public.historical_match_standings s
      on s.id = a.historical_match_standing_id where s.historical_match_import_id = v_import.id;
  select count(*)::integer into fixture_count from public.historical_match_fixtures f
    where f.historical_match_import_id = v_import.id;
  season_number := v_import.season_number; historical_label := v_import.historical_label;
  source_filename := v_import.source_filename; return next;
end;
$function$;

drop function public.delete_historical_match_import(uuid);
create function public.delete_historical_match_import(p_historical_match_import_id uuid)
returns table(
  historical_match_import_id uuid, deleted_import_count integer, deleted_standing_count integer,
  deleted_course_appearance_count integer, deleted_fixture_count integer,
  resolved_identity_count integer, season_number integer, historical_label text, source_filename text
)
language plpgsql security definer set search_path to ''
as $function$
declare v_import public.historical_match_imports%rowtype;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  select * into v_import from public.historical_match_imports
    where id = p_historical_match_import_id for update;
  if not found then raise exception 'Historical Match import was not found'; end if;
  select count(*)::integer, count(*) filter (where s.canonical_player_id is not null)::integer
    into deleted_standing_count, resolved_identity_count from public.historical_match_standings s
    where s.historical_match_import_id = v_import.id;
  select count(*)::integer into deleted_course_appearance_count
    from public.historical_match_course_appearances a join public.historical_match_standings s
      on s.id = a.historical_match_standing_id where s.historical_match_import_id = v_import.id;
  select count(*)::integer into deleted_fixture_count from public.historical_match_fixtures f
    where f.historical_match_import_id = v_import.id;
  delete from public.historical_match_imports i where i.id = v_import.id;
  get diagnostics deleted_import_count = row_count;
  if deleted_import_count <> 1 then raise exception 'Historical Match import deletion did not remove exactly one parent row'; end if;
  historical_match_import_id := v_import.id; season_number := v_import.season_number;
  historical_label := v_import.historical_label; source_filename := v_import.source_filename;
  return next;
end;
$function$;

revoke all on function public.preview_historical_match_import_deletion(uuid) from public, anon, authenticated;
grant execute on function public.preview_historical_match_import_deletion(uuid) to authenticated;
revoke all on function public.delete_historical_match_import(uuid) from public, anon, authenticated;
grant execute on function public.delete_historical_match_import(uuid) to authenticated;

-- Definition-only/read-only installation checks. No test data is inserted.
do $fixture_foundation_check$
declare v_bad_fk text; v_check_definition text; v_result_definition text;
begin
  if to_regclass('public.historical_match_fixtures') is null then
    raise exception 'historical_match_fixtures was not created';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.historical_match_fixtures'::regclass
      and conname in ('historical_match_fixtures_played_consistency'))
     or to_regclass('public.historical_match_fixtures_unordered_pair_key') is null
     or not exists (select 1 from pg_trigger where tgrelid = 'public.historical_match_fixtures'::regclass
      and tgname = 'enforce_historical_match_fixture_participation' and not tgisinternal) then
    raise exception 'Historical fixture constraints/index/trigger are incomplete';
  end if;
  select pg_get_constraintdef(oid) into v_check_definition from pg_constraint
    where conrelid = 'public.historical_match_imports'::regclass
      and conname = 'historical_match_imports_evidence_level_check';
  if v_check_definition not like '%fixture_detailed%' then
    raise exception 'fixture_detailed evidence was not accepted';
  end if;
  if to_regprocedure('public.commit_historical_match_preview(integer,text,integer,text,text,text,text,text,jsonb)') is null
     or to_regprocedure('public.preview_historical_match_import_deletion(uuid)') is null
     or to_regprocedure('public.delete_historical_match_import(uuid)') is null then
    raise exception 'Fixture-aware historical RPC definitions are incomplete';
  end if;
  select pg_get_function_result('public.preview_historical_match_import_deletion(uuid)'::regprocedure)
    into v_result_definition;
  if v_result_definition not like '%fixture_count%' then
    raise exception 'Deletion preview does not report fixture count';
  end if;
  select pg_get_function_result('public.delete_historical_match_import(uuid)'::regprocedure)
    into v_result_definition;
  if v_result_definition not like '%deleted_fixture_count%' then
    raise exception 'Historical deletion does not report deleted fixture count';
  end if;
  select string_agg(src.relname || ' -> ' || dst.relname, ', ') into v_bad_fk
  from pg_constraint fk join pg_class src on src.oid=fk.conrelid join pg_class dst on dst.oid=fk.confrelid
  where fk.contype='f' and src.relname='historical_match_fixtures'
    and dst.relname in ('seasons','schedule','results','season_standings','match_roster_versions',
      'match_division_roster_slots','match_schedule_state','match_final_scorecards',
      'match_final_scorecard_entries','match_final_scorecard_player_decisions');
  if v_bad_fk is not null then raise exception 'Forbidden managed Match FK: %', v_bad_fk; end if;
  -- Fixture mutation remains limited to this admin-authorized commit RPC and
  -- cascade deletion of its isolated historical import parent.
  if has_table_privilege('anon', 'public.historical_match_fixtures', 'INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'public.historical_match_fixtures', 'INSERT,UPDATE,DELETE') then
    raise exception 'Ordinary clients unexpectedly have historical fixture mutation privileges';
  end if;
end;
$fixture_foundation_check$;

commit;
