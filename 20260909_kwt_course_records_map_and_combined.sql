begin;

-- KWT player-facing records use authoritative course base_map metadata and
-- retain season/week provenance. Best Combined only joins the same stored
-- scorecard's Easy and Hard courses for the same player and KWT week.
drop function if exists public.get_public_kwt_course_records();

create function public.get_public_kwt_course_records()
returns table(
  course_code text,
  base_map text,
  course_name text,
  difficulty text,
  record_scope text,
  historical_rank text,
  season_number integer,
  week_number integer,
  score integer,
  player_id uuid,
  screen_name text
)
language sql
stable
security definer
set search_path to ''
as $function$
  with score_runs as (
    select score.season_number,
      score.week_number,
      course.code as course_code,
      course.base_map,
      course.base_map as course_name,
      course.difficulty as record_difficulty,
      score.easy_score as score,
      score.historical_rank,
      public.resolve_canonical_player_id(score.canonical_player_id) as player_id
    from public.historical_kwt_scorecards as score
    join public.all_time_courses as course
      on upper(course.code) = upper(score.easy_course_code)
      and course.difficulty = 'Easy'
      and course.active = true
    where score.easy_score is not null
    union all
    select score.season_number,
      score.week_number,
      course.code,
      course.base_map,
      course.base_map,
      course.difficulty,
      score.hard_score,
      score.historical_rank,
      public.resolve_canonical_player_id(score.canonical_player_id)
    from public.historical_kwt_scorecards as score
    join public.all_time_courses as course
      on upper(course.code) = upper(score.hard_course_code)
      and course.difficulty = 'Hard'
      and course.active = true
    where score.hard_score is not null
  ),
  combined_runs as (
    select score.season_number,
      score.week_number,
      easy.code as course_code,
      easy.base_map,
      easy.base_map as course_name,
      'Combined'::text as record_difficulty,
      score.total_score as score,
      score.historical_rank,
      public.resolve_canonical_player_id(score.canonical_player_id) as player_id
    from public.historical_kwt_scorecards as score
    join public.all_time_courses as easy
      on upper(easy.code) = upper(score.easy_course_code)
      and easy.difficulty = 'Easy'
      and easy.active = true
    join public.all_time_courses as hard
      on upper(hard.code) = upper(score.hard_course_code)
      and hard.difficulty = 'Hard'
      and hard.base_map = easy.base_map
      and hard.active = true
    where score.total_score is not null
  ),
  resolved_runs as (
    select runs.season_number,
      runs.week_number,
      runs.course_code,
      runs.base_map,
      runs.course_name,
      runs.record_difficulty as difficulty,
      runs.score,
      runs.historical_rank,
      runs.player_id,
      player.screen_name
    from score_runs as runs
    join public.players as player on player.id = runs.player_id
    union all
    select runs.season_number,
      runs.week_number,
      runs.course_code,
      runs.base_map,
      runs.course_name,
      runs.record_difficulty,
      runs.score,
      runs.historical_rank,
      runs.player_id,
      player.screen_name
    from combined_runs as runs
    join public.players as player on player.id = runs.player_id
  ),
  scoped_runs as (
    select resolved.course_code,
      resolved.base_map,
      resolved.course_name,
      resolved.difficulty,
      'overall'::text as record_scope,
      null::text as historical_rank,
      resolved.season_number,
      resolved.week_number,
      resolved.score,
      resolved.player_id,
      resolved.screen_name
    from resolved_runs as resolved
    union all
    select resolved.course_code,
      resolved.base_map,
      resolved.course_name,
      resolved.difficulty,
      'rank'::text,
      resolved.historical_rank,
      resolved.season_number,
      resolved.week_number,
      resolved.score,
      resolved.player_id,
      resolved.screen_name
    from resolved_runs as resolved
    where resolved.historical_rank in ('Amateur', 'Semi-Pro', 'Pro', 'Elite')
  ),
  ranked as (
    select scoped.*,
      min(scoped.score) over (
        partition by scoped.base_map,
          scoped.difficulty,
          scoped.record_scope,
          scoped.historical_rank
      ) as best_score
    from scoped_runs as scoped
  )
  select ranked.course_code,
    ranked.base_map,
    ranked.course_name,
    ranked.difficulty,
    ranked.record_scope,
    ranked.historical_rank,
    ranked.season_number,
    ranked.week_number,
    ranked.score,
    ranked.player_id,
    ranked.screen_name
  from ranked
  where ranked.score = ranked.best_score
  order by ranked.course_name,
    case when ranked.difficulty = 'Easy' then 1 when ranked.difficulty = 'Hard' then 2 else 3 end,
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
