create or replace function public.save_solo_score_attempt(
  p_attempt_id uuid,p_season_id uuid,p_week_id uuid,p_player_id uuid,p_difficulty text,p_stroke_score integer,p_hn1_count integer
) returns public.solo_score_attempts
language plpgsql security definer set search_path to '' as $function$
declare v_week public.solo_weeks%rowtype; v_result public.solo_score_attempts%rowtype;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  if lower(p_difficulty) not in ('easy','hard') or p_stroke_score is null or p_hn1_count is null or p_hn1_count<0 then raise exception 'Difficulty, stroke score, and non-negative HN1 are required'; end if;
  select * into v_week from public.solo_weeks where id=p_week_id and season_id=p_season_id for update;
  if not found or not exists(select 1 from public.seasons where id=p_season_id and lower(btrim(league_type))='solo') then raise exception 'Exact managed Solo season/week was not found'; end if;
  if v_week.status<>'open' then raise exception 'Closed Solo weeks cannot be edited'; end if;
  if not exists(select 1 from public.solo_roster_entries e join public.solo_roster_versions r on r.id=e.roster_version_id where e.season_id=p_season_id and e.player_id=p_player_id and r.status='approved') then raise exception 'Player is not on the approved Solo roster'; end if;
  if exists(select 1 from public.players where id=p_player_id and lower(btrim(screen_name))='bye') then raise exception 'BYE is not a Solo player identity'; end if;
  if p_attempt_id is null then
    insert into public.solo_score_attempts(season_id,week_id,player_id,difficulty,stroke_score,hn1_count,entered_by)
    values(p_season_id,p_week_id,p_player_id,lower(p_difficulty),p_stroke_score,p_hn1_count,auth.uid()) returning * into v_result;
  else
    update public.solo_score_attempts set stroke_score=p_stroke_score,hn1_count=p_hn1_count,updated_by=auth.uid(),updated_at=now()
    where id=p_attempt_id and season_id=p_season_id and week_id=p_week_id and player_id=p_player_id and difficulty=lower(p_difficulty) returning * into v_result;
    if not found then raise exception 'Solo score attempt was not found in the exact requested context'; end if;
  end if;
  return v_result;
end;$function$;
revoke all on function public.save_solo_score_attempt(uuid,uuid,uuid,uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.save_solo_score_attempt(uuid,uuid,uuid,uuid,text,integer,integer) to authenticated;

create or replace function public.delete_solo_score_attempt(p_attempt_id uuid,p_season_id uuid,p_week_id uuid)
returns void language plpgsql security definer set search_path to '' as $function$
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  perform 1 from public.solo_weeks where id=p_week_id and season_id=p_season_id and status='open' for update;
  if not found then raise exception 'Exact open Solo week was not found'; end if;
  delete from public.solo_score_attempts where id=p_attempt_id and season_id=p_season_id and week_id=p_week_id;
  if not found then raise exception 'Solo score attempt was not found'; end if;
end;$function$;
revoke all on function public.delete_solo_score_attempt(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_solo_score_attempt(uuid,uuid,uuid) to authenticated;
