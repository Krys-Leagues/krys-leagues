create or replace function public.get_admin_solo_week_completion(
  p_season_id uuid
)
returns table (
  week_id uuid,
  player_id uuid,
  difficulty text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not (
       public.is_current_user_site_admin()
       or public.is_current_user_solo_admin()
     ) then
    raise exception 'Administrator authorization is required.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.seasons as season
    where season.id = p_season_id
      and season.league_type = 'solo'
  ) then
    raise exception 'The exact managed Solo season was not found.' using errcode = 'P0002';
  end if;

  return query
  select
    attempt.week_id,
    attempt.player_id,
    attempt.difficulty
  from public.solo_live_best_attempts as attempt
  where attempt.season_id = p_season_id;
end;
$$;

revoke all on function public.get_admin_solo_week_completion(uuid) from public;
revoke all on function public.get_admin_solo_week_completion(uuid) from anon;
grant execute on function public.get_admin_solo_week_completion(uuid) to authenticated;
