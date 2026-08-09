create or replace function public.delete_pyp_result(p_schedule_id uuid)
returns table(result_id uuid,schedule_id uuid,season_id uuid,division_number integer,result_deleted boolean)
language plpgsql security definer set search_path to '' as $function$
declare v_user_id uuid:=auth.uid();v_fixture public.schedule%rowtype;v_result public.pyp_managed_results%rowtype;v_public_result public.results%rowtype;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  if v_user_id is null then raise exception 'Authentication is required to delete a PYP result' using errcode='42501'; end if;
  if p_schedule_id is null then raise exception 'Schedule fixture ID is required'; end if;
  select fixture.* into v_fixture from public.schedule fixture where fixture.id=p_schedule_id for update;
  if not found then raise exception 'Schedule fixture % was not found',p_schedule_id; end if;
  if lower(btrim(v_fixture.league_type)) is distinct from 'pyp' or v_fixture.season_id is null or v_fixture.pyp_roster_version_id is null or v_fixture.division_number is null
    then raise exception 'Schedule fixture % is not a valid managed PYP fixture',p_schedule_id; end if;
  if exists(select 1 from public.pyp_roster_versions r where r.id=v_fixture.pyp_roster_version_id and r.status='locked')
    or exists(select 1 from public.pyp_final_scorecards c where c.season_id=v_fixture.season_id and c.status='approved')
    then raise exception 'Results cannot be deleted from a finalized PYP season' using errcode='42501'; end if;
  perform 1 from public.pyp_schedule_state s where s.season_id=v_fixture.season_id and s.change_revision=s.generated_revision and s.generated_revision=s.reviewed_revision and s.generated_revision>0 for update;
  if not found then raise exception 'PYP results can be deleted only while the current schedule is generated and reviewed'; end if;
  select result.* into v_result from public.pyp_managed_results result where result.schedule_id=p_schedule_id for update;
  if not found then return query select null::uuid,v_fixture.id,v_fixture.season_id,v_fixture.division_number,false;return;end if;
  select result.* into v_public_result from public.results result where result.id=v_result.result_id and result.schedule_id=p_schedule_id and lower(btrim(result.league_type))='pyp' for update;
  if not found then raise exception 'Managed PYP result detail is missing its authoritative result row';end if;
  delete from public.pyp_managed_results result where result.id=v_result.id;
  delete from public.results result where result.id=v_public_result.id;
  perform 1 from public.rebuild_pyp_standings(v_fixture.season_id,v_fixture.division_number);
  return query select v_public_result.id,v_fixture.id,v_fixture.season_id,v_fixture.division_number,true;
end;
$function$;

revoke all on function public.delete_pyp_result(uuid) from public,anon,authenticated;
grant execute on function public.delete_pyp_result(uuid) to authenticated;
