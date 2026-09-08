begin;

-- KWT course records only. Historical KWT scorecards remain source data and are
-- never modified. A run always competes for Overall; a rank row is emitted only
-- when historical_rank is already stored as one of the four proven rank values.
-- This replaces the prior seven-column function contract with an explicit scope.
drop function if exists public.get_public_kwt_course_records();

create function public.get_public_kwt_course_records()
returns table(
  course_code text,
  course_name text,
  difficulty text,
  record_scope text,
  historical_rank text,
  score integer,
  player_id uuid,
  screen_name text
)
language sql
stable
security definer
set search_path to ''
as $function$
  with runs as (
    select score.easy_course_code as course_code,
      'Easy'::text as difficulty,
      score.easy_score as score,
      score.historical_rank,
      public.resolve_canonical_player_id(score.canonical_player_id) as player_id
    from public.historical_kwt_scorecards as score
    where score.easy_score is not null
    union all
    select score.hard_course_code,
      'Hard'::text,
      score.hard_score,
      score.historical_rank,
      public.resolve_canonical_player_id(score.canonical_player_id)
    from public.historical_kwt_scorecards as score
    where score.hard_score is not null
  ),
  catalog as (
    select course.code, course.display_name, course.difficulty
    from public.all_time_courses as course
    where course.active = true
      and course.difficulty in ('Easy', 'Hard')
  ),
  resolved_runs as (
    select catalog.code as course_code,
      catalog.display_name as course_name,
      catalog.difficulty,
      runs.score,
      runs.historical_rank,
      runs.player_id,
      player.screen_name
    from runs
    join catalog
      on upper(catalog.code) = upper(runs.course_code)
      and catalog.difficulty = runs.difficulty
    join public.players as player on player.id = runs.player_id
    where runs.score is not null
  ),
  scoped_runs as (
    select resolved.course_code,
      resolved.course_name,
      resolved.difficulty,
      'overall'::text as record_scope,
      null::text as historical_rank,
      resolved.score,
      resolved.player_id,
      resolved.screen_name
    from resolved_runs as resolved
    union all
    select resolved.course_code,
      resolved.course_name,
      resolved.difficulty,
      'rank'::text,
      resolved.historical_rank,
      resolved.score,
      resolved.player_id,
      resolved.screen_name
    from resolved_runs as resolved
    where resolved.historical_rank in ('Amateur', 'Semi-Pro', 'Pro', 'Elite')
  ),
  ranked as (
    select scoped.*,
      min(scoped.score) over (
        partition by scoped.course_code,
          scoped.difficulty,
          scoped.record_scope,
          scoped.historical_rank
      ) as best_score
    from scoped_runs as scoped
  )
  select ranked.course_code,
    ranked.course_name,
    ranked.difficulty,
    ranked.record_scope,
    ranked.historical_rank,
    ranked.score,
    ranked.player_id,
    ranked.screen_name
  from ranked
  where ranked.score = ranked.best_score
  order by ranked.course_name,
    case when ranked.difficulty = 'Easy' then 1 else 2 end,
    case when ranked.record_scope = 'overall' then 1 else 2 end,
    case ranked.historical_rank
      when 'Amateur' then 1
      when 'Semi-Pro' then 2
      when 'Pro' then 3
      when 'Elite' then 4
      else 5
    end,
    ranked.screen_name;
$function$;

revoke all on function public.get_public_kwt_course_records() from public;
grant execute on function public.get_public_kwt_course_records() to anon, authenticated;

commit;
