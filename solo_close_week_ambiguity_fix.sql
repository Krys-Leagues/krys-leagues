begin;

create or replace function public.close_solo_week(
  p_season_id uuid,
  p_week_id uuid
) returns table(
  snapshot_id uuid,
  revision integer,
  player_count integer,
  missing_easy integer,
  missing_hard integer
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_week public.solo_weeks%rowtype;
  v_roster_id uuid;
  v_snapshot_id uuid;
  v_revision integer;
  v_count integer;
  v_missing_easy integer;
  v_missing_hard integer;
begin
  if auth.uid() is null or not public.can_current_user_admin_solo() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;

  perform 1
  from public.seasons
  where id = p_season_id
    and lower(btrim(league_type)) = 'solo'
  for update;
  if not found then raise exception 'Exact Solo season was not found'; end if;

  select *
  into v_week
  from public.solo_weeks
  where id = p_week_id
    and season_id = p_season_id
  for update;
  if not found or v_week.status <> 'open' then raise exception 'Exact open Solo week was not found'; end if;

  select id
  into v_roster_id
  from public.solo_roster_versions
  where season_id = p_season_id
    and status = 'approved'
  for update;
  if not found then raise exception 'An approved Solo roster is required'; end if;

  perform 1
  from public.solo_score_attempts
  where week_id = p_week_id
  for update;

  select coalesce(max(snapshot.revision), 0) + 1
  into v_revision
  from public.solo_week_snapshots as snapshot
  where snapshot.week_id = p_week_id;

  update public.solo_week_snapshots
  set is_current = false,
      superseded_at = now(),
      superseded_by = auth.uid()
  where week_id = p_week_id
    and is_current;

  insert into public.solo_week_snapshots(
    season_id,
    week_id,
    week_number,
    revision,
    course_name,
    closed_at,
    closed_by
  )
  values(
    p_season_id,
    p_week_id,
    v_week.week_number,
    v_revision,
    v_week.course_name,
    now(),
    auth.uid()
  )
  returning id into v_snapshot_id;

  insert into public.solo_week_snapshot_entries(
    snapshot_id,
    season_id,
    week_id,
    week_number,
    division,
    display_order,
    player_id,
    player_screen_name,
    course_name,
    easy_attempt_id,
    easy_stroke_score,
    easy_hn1_count,
    hard_attempt_id,
    hard_stroke_score,
    hard_hn1_count,
    most_hn1_easy,
    most_hn1_hard
  )
  select
    v_snapshot_id,
    p_season_id,
    p_week_id,
    v_week.week_number,
    roster_entry.division,
    roster_entry.display_order,
    roster_entry.player_id,
    roster_entry.player_screen_name,
    v_week.course_name,
    easy.id,
    easy.stroke_score,
    easy.hn1_count,
    hard.id,
    hard.stroke_score,
    hard.hn1_count,
    easy_rec.most_hn1,
    hard_rec.most_hn1
  from public.solo_roster_entries as roster_entry
  left join public.solo_live_best_attempts as easy
    on easy.week_id = p_week_id
   and easy.player_id = roster_entry.player_id
   and easy.difficulty = 'easy'
  left join public.solo_live_best_attempts as hard
    on hard.week_id = p_week_id
   and hard.player_id = roster_entry.player_id
   and hard.difficulty = 'hard'
  left join public.solo_live_hn1_recognition as easy_rec
    on easy_rec.week_id = p_week_id
   and easy_rec.player_id = roster_entry.player_id
   and easy_rec.difficulty = 'easy'
  left join public.solo_live_hn1_recognition as hard_rec
    on hard_rec.week_id = p_week_id
   and hard_rec.player_id = roster_entry.player_id
   and hard_rec.difficulty = 'hard'
  where roster_entry.roster_version_id = v_roster_id;

  get diagnostics v_count = row_count;

  select
    count(*) filter (where snapshot_entry.easy_stroke_score is null),
    count(*) filter (where snapshot_entry.hard_stroke_score is null)
  into v_missing_easy, v_missing_hard
  from public.solo_week_snapshot_entries as snapshot_entry
  where snapshot_entry.snapshot_id = v_snapshot_id;

  update public.solo_weeks
  set status = 'closed',
      closed_at = now(),
      closed_by = auth.uid()
  where id = p_week_id;

  return query
  select v_snapshot_id, v_revision, v_count, v_missing_easy, v_missing_hard;
end;
$function$;

revoke all on function public.close_solo_week(uuid,uuid)
from public, anon, authenticated;
grant execute on function public.close_solo_week(uuid,uuid)
to authenticated;

commit;
