create or replace function public.close_solo_week(p_season_id uuid,p_week_id uuid)
returns table(snapshot_id uuid,revision integer,player_count integer,missing_easy integer,missing_hard integer)
language plpgsql security definer set search_path to '' as $function$
declare v_week public.solo_weeks%rowtype;v_roster_id uuid;v_snapshot_id uuid;v_revision integer;v_count integer;v_missing_easy integer;v_missing_hard integer;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  perform 1 from public.seasons where id=p_season_id and lower(btrim(league_type))='solo' for update;
  if not found then raise exception 'Exact Solo season was not found'; end if;
  select * into v_week from public.solo_weeks where id=p_week_id and season_id=p_season_id for update;
  if not found or v_week.status<>'open' then raise exception 'Exact open Solo week was not found'; end if;
  select id into v_roster_id from public.solo_roster_versions where season_id=p_season_id and status='approved' for update;
  if not found then raise exception 'An approved Solo roster is required'; end if;
  perform 1 from public.solo_score_attempts where week_id=p_week_id for update;
  select coalesce(max(s.revision),0)+1 into v_revision from public.solo_week_snapshots s where s.week_id=p_week_id;
  update public.solo_week_snapshots set is_current=false,superseded_at=now(),superseded_by=auth.uid() where week_id=p_week_id and is_current;
  insert into public.solo_week_snapshots(season_id,week_id,week_number,revision,course_name,closed_at,closed_by)
  values(p_season_id,p_week_id,v_week.week_number,v_revision,v_week.course_name,now(),auth.uid()) returning id into v_snapshot_id;
  insert into public.solo_week_snapshot_entries(snapshot_id,season_id,week_id,week_number,division,display_order,player_id,player_screen_name,course_name,easy_attempt_id,easy_stroke_score,easy_hn1_count,hard_attempt_id,hard_stroke_score,hard_hn1_count,most_hn1_easy,most_hn1_hard)
  select v_snapshot_id,p_season_id,p_week_id,v_week.week_number,e.division,e.display_order,e.player_id,e.player_screen_name,v_week.course_name,
    easy.id,easy.stroke_score,easy.hn1_count,hard.id,hard.stroke_score,hard.hn1_count,easy_rec.most_hn1,hard_rec.most_hn1
  from public.solo_roster_entries e
  left join public.solo_live_best_attempts easy on easy.week_id=p_week_id and easy.player_id=e.player_id and easy.difficulty='easy'
  left join public.solo_live_best_attempts hard on hard.week_id=p_week_id and hard.player_id=e.player_id and hard.difficulty='hard'
  left join public.solo_live_hn1_recognition easy_rec on easy_rec.week_id=p_week_id and easy_rec.player_id=e.player_id and easy_rec.difficulty='easy'
  left join public.solo_live_hn1_recognition hard_rec on hard_rec.week_id=p_week_id and hard_rec.player_id=e.player_id and hard_rec.difficulty='hard'
  where e.roster_version_id=v_roster_id;
  get diagnostics v_count=row_count;
  select count(*) filter(where easy_stroke_score is null),count(*) filter(where hard_stroke_score is null) into v_missing_easy,v_missing_hard from public.solo_week_snapshot_entries where snapshot_id=v_snapshot_id;
  update public.solo_weeks set status='closed',closed_at=now(),closed_by=auth.uid() where id=p_week_id;
  return query select v_snapshot_id,v_revision,v_count,v_missing_easy,v_missing_hard;
end;$function$;
revoke all on function public.close_solo_week(uuid,uuid) from public,anon,authenticated;
grant execute on function public.close_solo_week(uuid,uuid) to authenticated;

create or replace function public.reopen_solo_week(p_season_id uuid,p_week_id uuid)
returns public.solo_weeks language plpgsql security definer set search_path to '' as $function$
declare v_week public.solo_weeks%rowtype;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  perform 1 from public.seasons where id=p_season_id and lower(btrim(league_type))='solo' for update;
  if not found then raise exception 'Exact Solo season was not found'; end if;
  select * into v_week from public.solo_weeks where id=p_week_id and season_id=p_season_id for update;
  if not found or v_week.status<>'closed' then raise exception 'Exact closed Solo week was not found'; end if;
  update public.solo_week_snapshots set is_current=false,superseded_at=now(),superseded_by=auth.uid() where week_id=p_week_id and is_current;
  update public.solo_weeks set status='open',closed_at=null,closed_by=null where id=p_week_id returning * into v_week;
  return v_week;
end;$function$;
revoke all on function public.reopen_solo_week(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reopen_solo_week(uuid,uuid) to authenticated;
