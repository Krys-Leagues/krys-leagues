create or replace function public.approve_pyp_final_scorecard(p_final_scorecard_id uuid,p_approval_note text default null)
returns table(scorecard_id uuid,season_id uuid,roster_version_id uuid,status text,approved_at timestamptz,approved_by uuid)
language plpgsql security definer set search_path to '' as $function$
declare
  v_user_id uuid:=auth.uid();v_card public.pyp_final_scorecards%rowtype;v_roster public.pyp_roster_versions%rowtype;v_season public.seasons%rowtype;v_state public.pyp_schedule_state%rowtype;
  v_incomplete integer;v_roster_players integer;v_entry_count integer;v_result_count integer;v_detail_count integer;v_division integer;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501';end if;
  if v_user_id is null then raise exception 'Authentication is required';end if;
  if p_final_scorecard_id is null then raise exception 'Final Scorecard ID is required';end if;
  select c.* into v_card from public.pyp_final_scorecards c where c.id=p_final_scorecard_id;
  if not found then raise exception 'PYP Final Scorecard was not found';end if;
  select r.* into v_roster from public.pyp_roster_versions r where r.id=v_card.source_roster_version_id and r.season_id=v_card.season_id for update;
  if not found or v_roster.status<>'approved' then raise exception 'The source PYP roster is no longer approved';end if;
  select s.* into v_season from public.seasons s where s.id=v_card.season_id for share;
  if not found or lower(btrim(v_season.league_type)) is distinct from 'pyp' then raise exception 'Parent season is not PYP';end if;
  select s.* into v_state from public.pyp_schedule_state s where s.season_id=v_card.season_id and s.change_revision=s.generated_revision and s.generated_revision=s.reviewed_revision and s.generated_revision>0 for update;
  if not found then raise exception 'The current PYP schedule must be generated and reviewed first';end if;
  select c.* into v_card from public.pyp_final_scorecards c where c.id=p_final_scorecard_id for update;
  if v_card.status<>'draft' then raise exception 'Only a draft PYP Final Scorecard can be approved';end if;
  if v_card.source_change_revision<>v_state.change_revision then raise exception 'Final Scorecard is stale. Regenerate it before approval.';end if;
  select count(*)::integer into v_incomplete from public.schedule f where lower(btrim(f.league_type))='pyp' and f.season_id=v_card.season_id and f.pyp_roster_version_id=v_roster.id
    and not exists(select 1 from public.pyp_managed_results r where r.schedule_id=f.id and nullif(btrim(r.course1_name),'') is not null and nullif(btrim(r.course2_name),'') is not null);
  if v_incomplete>0 then raise exception 'Final Scorecard cannot be approved: % managed fixture(s) are incomplete',v_incomplete;end if;
  if exists(select 1 from public.pyp_managed_results r where r.season_id=v_card.season_id and r.roster_version_id=v_roster.id and r.updated_at>v_card.updated_at) then raise exception 'Final Scorecard is stale. Regenerate it before approval.';end if;
  select count(*)::integer into v_roster_players from public.pyp_division_roster_slots s where s.roster_version_id=v_roster.id and s.player_id is not null;
  select count(*)::integer into v_entry_count from public.pyp_final_scorecard_entries e where e.scorecard_id=v_card.id;
  select count(*)::integer into v_result_count from public.pyp_managed_results r where r.season_id=v_card.season_id and r.roster_version_id=v_roster.id;
  select count(*)::integer into v_detail_count from public.pyp_final_scorecard_fixture_details d where d.scorecard_id=v_card.id;
  if v_entry_count<>v_roster_players or v_detail_count<>v_result_count*2 then raise exception 'Final Scorecard snapshot is incomplete. Regenerate it before approval.';end if;
  for v_division in 1..v_roster.division_count loop perform 1 from public.rebuild_pyp_standings(v_card.season_id,v_division);end loop;
  update public.pyp_final_scorecards c set status='approved',approved_at=now(),approved_by=v_user_id,approval_note=nullif(btrim(p_approval_note),''),updated_at=now() where c.id=v_card.id returning c.* into v_card;
  update public.pyp_roster_versions r set status='locked',locked_at=now(),locked_by=v_user_id,updated_at=now() where r.id=v_roster.id;
  return query select v_card.id,v_card.season_id,v_card.source_roster_version_id,v_card.status,v_card.approved_at,v_card.approved_by;
end;
$function$;

revoke all on function public.approve_pyp_final_scorecard(uuid,text) from public,anon,authenticated;
grant execute on function public.approve_pyp_final_scorecard(uuid,text) to authenticated;
