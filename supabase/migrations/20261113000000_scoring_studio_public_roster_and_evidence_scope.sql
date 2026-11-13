-- Public leaderboard roster access is limited to published scoring instances.
-- Evidence uploads must be scoped to the authenticated player's registration.

grant execute on function public.scoring_studio_registered_players_v1(uuid) to anon;

create or replace function public.scoring_studio_valid_evidence_path(p_path text)
returns boolean language sql stable security definer set search_path = '' as $function$
  select case
    when auth.uid() is null or public.current_major_player_id() is null then false
    when cardinality(string_to_array(p_path, '/')) <> 4 then false
    when split_part(p_path, '/', 3) <> public.current_major_player_id()::text then false
    else exists (
      select 1
      from public.scoring_studio_instances i
      join public.scoring_studio_rounds r on r.instance_id=i.id
      where i.id::text=split_part(p_path,'/',1)
        and r.id::text=split_part(p_path,'/',2)
        and i.status='live'
        and i.public_results
        and public.scoring_studio_registered(i.id,r.id,public.current_major_player_id())
    )
  end;
$function$;

revoke all on function public.scoring_studio_valid_evidence_path(text) from public,anon;
grant execute on function public.scoring_studio_valid_evidence_path(text) to authenticated;
