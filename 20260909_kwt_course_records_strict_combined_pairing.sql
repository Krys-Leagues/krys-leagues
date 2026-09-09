begin;

-- Replace the unsafe KWT Combined reader with one authoritative, auditable
-- pairing source. No historical KWT rows are modified.
drop function if exists public.get_public_kwt_course_records();
drop function if exists public.get_public_kwt_combined_records();

create function public.get_public_kwt_combined_records()
returns table(
  scorecard_id uuid,
  historical_kwt_import_id uuid,
  event_key text,
  season_number integer,
  week_number integer,
  player_id uuid,
  screen_name text,
  base_map text,
  easy_course_code text,
  hard_course_code text,
  easy_round_id text,
  hard_round_id text,
  easy_score integer,
  hard_score integer,
  combined_score integer,
  historical_rank text,
  record_scope text,
  pairing_evidence_type text
)
language sql
stable
security definer
set search_path to ''
as $function$
  with paired as (
    select
      score.id as scorecard_id,
      score.historical_kwt_import_id,
      concat(score.historical_kwt_import_id::text, ':', score.season_number, ':', score.week_number, ':', score.id::text) as event_key,
      score.season_number,
      score.week_number,
      public.resolve_canonical_player_id(score.canonical_player_id) as player_id,
      player.screen_name,
      easy.base_map,
      easy.code as easy_course_code,
      hard.code as hard_course_code,
      btrim(score.easy_round_id) as easy_round_id,
      btrim(score.hard_round_id) as hard_round_id,
      score.easy_score,
      score.hard_score,
      score.easy_score + score.hard_score as combined_score,
      score.historical_rank
    from public.historical_kwt_scorecards as score
    join public.all_time_courses as easy on upper(easy.code) = upper(score.easy_course_code) and easy.difficulty = 'Easy' and easy.active = true
    join public.all_time_courses as hard on upper(hard.code) = upper(score.hard_course_code) and hard.difficulty = 'Hard' and hard.base_map = easy.base_map and hard.active = true
    join public.players as player on player.id = public.resolve_canonical_player_id(score.canonical_player_id)
    where score.easy_score is not null
      and score.hard_score is not null
      and score.total_score = score.easy_score + score.hard_score
      and nullif(btrim(score.easy_round_id), '') is not null
      and nullif(btrim(score.hard_round_id), '') is not null
      and btrim(score.easy_round_id) ~ '^[0-9]+$'
      and btrim(score.hard_round_id) ~ '^[0-9]+$'
      and btrim(score.hard_round_id)::numeric = btrim(score.easy_round_id)::numeric + 1
  )
  select paired.scorecard_id, paired.historical_kwt_import_id, paired.event_key, paired.season_number, paired.week_number, paired.player_id, paired.screen_name, paired.base_map, paired.easy_course_code, paired.hard_course_code, paired.easy_round_id, paired.hard_round_id, paired.easy_score, paired.hard_score, paired.combined_score, paired.historical_rank, 'overall'::text, 'same_scorecard_consecutive_source_rounds'::text from paired
  union all
  select paired.scorecard_id, paired.historical_kwt_import_id, paired.event_key, paired.season_number, paired.week_number, paired.player_id, paired.screen_name, paired.base_map, paired.easy_course_code, paired.hard_course_code, paired.easy_round_id, paired.hard_round_id, paired.easy_score, paired.hard_score, paired.combined_score, paired.historical_rank, 'rank'::text, 'same_scorecard_consecutive_source_rounds'::text from paired where paired.historical_rank in ('Amateur', 'Semi-Pro', 'Pro', 'Elite');
$function$;

revoke all on function public.get_public_kwt_combined_records() from public;
grant execute on function public.get_public_kwt_combined_records() to anon, authenticated;

create function public.get_public_kwt_course_records()
returns table(course_code text, base_map text, course_name text, difficulty text, record_scope text, historical_rank text, season_number integer, week_number integer, score integer, player_id uuid, screen_name text, scorecard_id uuid, event_key text, easy_round_id text, hard_round_id text, pairing_evidence_type text)
language sql stable security definer set search_path to ''
as $function$
  with score_runs as (
    select score.season_number, score.week_number, course.code as course_code, course.base_map, course.base_map as course_name, course.difficulty as record_difficulty, score.easy_score as score, score.historical_rank, public.resolve_canonical_player_id(score.canonical_player_id) as player_id, score.id as scorecard_id, null::text as event_key, null::text as easy_round_id, null::text as hard_round_id, null::text as pairing_evidence_type
    from public.historical_kwt_scorecards as score
    join public.all_time_courses as course on upper(course.code) = upper(score.easy_course_code) and course.difficulty = 'Easy' and course.active = true
    where score.easy_score is not null
    union all
    select score.season_number, score.week_number, course.code, course.base_map, course.base_map, course.difficulty, score.hard_score, score.historical_rank, public.resolve_canonical_player_id(score.canonical_player_id), score.id, null::text, null::text, null::text, null::text
    from public.historical_kwt_scorecards as score
    join public.all_time_courses as course on upper(course.code) = upper(score.hard_course_code) and course.difficulty = 'Hard' and course.active = true
    where score.hard_score is not null
  ), combined_runs as (
    select paired.season_number, paired.week_number, paired.easy_course_code as course_code, paired.base_map, paired.base_map as course_name, 'Combined'::text as record_difficulty, paired.combined_score as score, paired.historical_rank, paired.player_id, paired.scorecard_id, paired.event_key, paired.easy_round_id, paired.hard_round_id, paired.pairing_evidence_type
    from public.get_public_kwt_combined_records() as paired
    where paired.record_scope = 'overall'
  ), resolved_runs as (
    select runs.season_number, runs.week_number, runs.course_code, runs.base_map, runs.course_name, runs.record_difficulty as difficulty, runs.score, runs.historical_rank, runs.player_id, player.screen_name, runs.scorecard_id, runs.event_key, runs.easy_round_id, runs.hard_round_id, runs.pairing_evidence_type
    from score_runs as runs join public.players as player on player.id = runs.player_id
    union all
    select runs.season_number, runs.week_number, runs.course_code, runs.base_map, runs.course_name, runs.record_difficulty, runs.score, runs.historical_rank, runs.player_id, player.screen_name, runs.scorecard_id, runs.event_key, runs.easy_round_id, runs.hard_round_id, runs.pairing_evidence_type
    from combined_runs as runs join public.players as player on player.id = runs.player_id
  ), scoped_runs as (
    select resolved.course_code, resolved.base_map, resolved.course_name, resolved.difficulty, 'overall'::text as record_scope, null::text as historical_rank, resolved.season_number, resolved.week_number, resolved.score, resolved.player_id, resolved.screen_name, resolved.scorecard_id, resolved.event_key, resolved.easy_round_id, resolved.hard_round_id, resolved.pairing_evidence_type
    from resolved_runs as resolved
    union all
    select resolved.course_code, resolved.base_map, resolved.course_name, resolved.difficulty, 'rank'::text, resolved.historical_rank, resolved.season_number, resolved.week_number, resolved.score, resolved.player_id, resolved.screen_name, resolved.scorecard_id, resolved.event_key, resolved.easy_round_id, resolved.hard_round_id, resolved.pairing_evidence_type
    from resolved_runs as resolved where resolved.historical_rank in ('Amateur', 'Semi-Pro', 'Pro', 'Elite')
  ), ranked as (
    select scoped.*, min(scoped.score) over (partition by scoped.base_map, scoped.difficulty, scoped.record_scope, scoped.historical_rank) as best_score
    from scoped_runs as scoped
  )
  select ranked.course_code, ranked.base_map, ranked.course_name, ranked.difficulty, ranked.record_scope, ranked.historical_rank, ranked.season_number, ranked.week_number, ranked.score, ranked.player_id, ranked.screen_name, ranked.scorecard_id, ranked.event_key, ranked.easy_round_id, ranked.hard_round_id, ranked.pairing_evidence_type
  from ranked
  where ranked.score = ranked.best_score
  order by ranked.course_name, case when ranked.difficulty = 'Easy' then 1 when ranked.difficulty = 'Hard' then 2 else 3 end, case when ranked.record_scope = 'overall' then 1 else 2 end, ranked.screen_name;
$function$;

revoke all on function public.get_public_kwt_course_records() from public;
grant execute on function public.get_public_kwt_course_records() to anon, authenticated;

commit;
