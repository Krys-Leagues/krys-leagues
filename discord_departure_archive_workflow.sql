begin;

-- Definition only. The Krys League Bot runtime is not stored in this repo.
-- Its guildMemberRemove handler should create one private case and post the
-- returned identity snapshot only to the configured admin departure channel.

create table if not exists public.discord_departure_cases (
  id uuid primary key default gen_random_uuid(),
  canonical_player_id uuid null references public.players(id) on delete restrict,
  discord_id text not null check(discord_id ~ '^[0-9]+$'),
  canonical_screen_name_snapshot text null,
  server_display_name_snapshot text null,
  discord_username_snapshot text null,
  previous_player_status text null,
  memorial_snapshot boolean null,
  detection_source text not null check(detection_source in ('guild_member_remove','admin_reconciliation')),
  detected_at timestamptz not null,
  private_channel_id text not null check(btrim(private_channel_id) <> ''),
  private_message_id text null,
  resolution_status text not null check(resolution_status in ('resolved','unresolved','ambiguous')),
  review_status text not null default 'pending' check(review_status in ('pending','ignored','archive_cancelled_rejoined','archived','inactive')),
  membership_rechecked_at timestamptz null,
  membership_present_at_recheck boolean null,
  confirmed_by_discord_id text null,
  confirmed_by_user_id uuid null references auth.users(id) on delete restrict,
  confirmed_at timestamptz null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint discord_departure_resolved_player_check check((resolution_status='resolved' and canonical_player_id is not null) or (resolution_status in ('unresolved','ambiguous') and canonical_player_id is null))
);
create index if not exists discord_departure_pending_idx on public.discord_departure_cases(review_status,detected_at desc);
create index if not exists discord_departure_player_idx on public.discord_departure_cases(canonical_player_id,detected_at desc) where canonical_player_id is not null;
create unique index if not exists discord_departure_private_message_uidx on public.discord_departure_cases(private_channel_id,private_message_id) where private_message_id is not null;

create table if not exists public.player_status_audit (
  id uuid primary key default gen_random_uuid(),
  canonical_player_id uuid not null references public.players(id) on delete restrict,
  previous_status text not null,
  new_status text not null,
  discord_id text null,
  detected_at timestamptz null,
  confirmed_by_user_id uuid not null references auth.users(id) on delete restrict,
  confirmed_by_discord_id text null,
  confirmed_at timestamptz not null default now(),
  reason_source text not null check(reason_source in ('discord_departure','website_admin')),
  source_case_id uuid null references public.discord_departure_cases(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists player_status_audit_player_idx on public.player_status_audit(canonical_player_id,confirmed_at desc);

alter table public.discord_departure_cases enable row level security;
alter table public.player_status_audit enable row level security;
drop policy if exists discord_departure_cases_admin_read on public.discord_departure_cases;
drop policy if exists player_status_audit_admin_read on public.player_status_audit;
create policy discord_departure_cases_admin_read on public.discord_departure_cases for select to authenticated using(public.is_current_user_site_admin());
create policy player_status_audit_admin_read on public.player_status_audit for select to authenticated using(public.is_current_user_site_admin());
grant select on public.discord_departure_cases,public.player_status_audit to authenticated;
revoke insert,update,delete on public.discord_departure_cases,public.player_status_audit from public,anon,authenticated;

create or replace function public.set_site_player_status(
  p_player_id uuid,
  p_new_status text,
  p_reason_source text,
  p_reason text,
  p_source_departure_case_id uuid default null,
  p_confirming_admin_discord_id text default null
) returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  v_player public.players%rowtype;
  v_previous_status text;
  v_defer_records_cleanup boolean := false;
begin
  if not public.is_current_user_site_admin() or auth.uid() is null then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  if p_new_status not in ('active','inactive','archived') then raise exception 'Player status must be Active, Inactive, or Archived'; end if;
  if p_reason_source not in ('discord_departure','website_admin') or nullif(btrim(p_reason),'') is null then raise exception 'A valid status-change source and reason are required'; end if;
  select * into v_player from public.players where id=p_player_id for update;
  if not found or public.resolve_canonical_player_id(v_player.id) is distinct from v_player.id then raise exception 'Status changes must target one canonical player UUID'; end if;
  v_previous_status := coalesce(v_player.status::text,case when v_player.active then 'active' else 'inactive' end);
  if p_new_status='archived' then select exists(select 1 from public.climbers_seasons where status in ('active','awaiting_finalization')) into v_defer_records_cleanup; end if;
  update public.players set status=p_new_status,active=(p_new_status='active') where id=v_player.id;
  if p_new_status='active' then
    update public.all_time_best_records set active_leaderboard_visible=true,visibility_changed_at=now(),visibility_reason='canonical player reactivated' where player_id=v_player.id and not active_leaderboard_visible;
  elsif p_new_status='archived' and not coalesce(v_player.is_memorial,false) and not v_defer_records_cleanup then
    update public.all_time_best_records set active_leaderboard_visible=false,visibility_changed_at=now(),visibility_reason='normal archived player after safe Climbers boundary' where player_id=v_player.id and active_leaderboard_visible;
  end if;
  insert into public.player_status_audit(canonical_player_id,previous_status,new_status,discord_id,detected_at,confirmed_by_user_id,confirmed_by_discord_id,reason_source,source_case_id,metadata)
  values(v_player.id,v_previous_status,p_new_status,v_player.discord_id,case when p_source_departure_case_id is null then null else (select detected_at from public.discord_departure_cases where id=p_source_departure_case_id) end,auth.uid(),p_confirming_admin_discord_id,p_reason_source,p_source_departure_case_id,jsonb_build_object('reason',p_reason,'records_cleanup_deferred',v_defer_records_cleanup,'memorial',coalesce(v_player.is_memorial,false)));
  return jsonb_build_object('canonical_player_id',v_player.id,'previous_status',v_previous_status,'new_status',p_new_status,'records_cleanup_deferred',v_defer_records_cleanup,'memorial',coalesce(v_player.is_memorial,false));
end;
$function$;
revoke all on function public.set_site_player_status(uuid,text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.set_site_player_status(uuid,text,text,text,uuid,text) to authenticated;

create or replace function public.confirm_discord_departure_player_action(
  p_case_id uuid,
  p_action text,
  p_membership_rechecked_at timestamptz,
  p_currently_guild_member boolean,
  p_confirming_admin_discord_id text
) returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  v_case public.discord_departure_cases%rowtype;
  v_player public.players%rowtype;
  v_new_status text;
  v_status_result jsonb;
begin
  if not public.is_current_user_site_admin() or auth.uid() is null then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  if p_action not in ('archive_player','mark_inactive','ignore') then raise exception 'Departure action is invalid'; end if;
  if p_membership_rechecked_at is null or p_membership_rechecked_at < now()-interval '5 minutes' or p_membership_rechecked_at > now()+interval '1 minute' then raise exception 'A fresh live Discord guild membership recheck is required'; end if;
  select * into v_case from public.discord_departure_cases where id=p_case_id for update;
  if not found or v_case.review_status <> 'pending' then raise exception 'Pending departure case was not found'; end if;
  if v_case.resolution_status <> 'resolved' or v_case.canonical_player_id is null then raise exception 'Departure case does not have one canonical player'; end if;
  select * into v_player from public.players where id=v_case.canonical_player_id for update;
  if public.resolve_canonical_player_id(v_player.id) is distinct from v_player.id then raise exception 'Status changes must target the canonical player UUID'; end if;
  if nullif(btrim(v_player.discord_id),'') is distinct from v_case.discord_id then raise exception 'Canonical Discord identity changed; create a new departure review'; end if;
  if p_action='ignore' then
    update public.discord_departure_cases set review_status='ignored',membership_rechecked_at=p_membership_rechecked_at,membership_present_at_recheck=p_currently_guild_member,confirmed_by_discord_id=p_confirming_admin_discord_id,confirmed_by_user_id=auth.uid(),confirmed_at=now() where id=p_case_id;
    return jsonb_build_object('status','ignored','player_changed',false);
  end if;
  if p_currently_guild_member then
    update public.discord_departure_cases set review_status='archive_cancelled_rejoined',membership_rechecked_at=p_membership_rechecked_at,membership_present_at_recheck=true,confirmed_by_discord_id=p_confirming_admin_discord_id,confirmed_by_user_id=auth.uid(),confirmed_at=now() where id=p_case_id;
    return jsonb_build_object('status','archive_cancelled_rejoined','player_changed',false,'message','Archive cancelled — this player is currently a member of the server.');
  end if;
  v_new_status := case p_action when 'archive_player' then 'archived' else 'inactive' end;
  select public.set_site_player_status(v_player.id,v_new_status,'discord_departure','Confirmed absent after private Discord departure review',p_case_id,p_confirming_admin_discord_id) into v_status_result;
  update public.discord_departure_cases set review_status=case p_action when 'archive_player' then 'archived' else 'inactive' end,membership_rechecked_at=p_membership_rechecked_at,membership_present_at_recheck=false,confirmed_by_discord_id=p_confirming_admin_discord_id,confirmed_by_user_id=auth.uid(),confirmed_at=now() where id=p_case_id;
  return v_status_result || jsonb_build_object('status',v_new_status,'player_changed',true);
end;
$function$;
revoke all on function public.confirm_discord_departure_player_action(uuid,text,timestamptz,boolean,text) from public,anon,authenticated;
grant execute on function public.confirm_discord_departure_player_action(uuid,text,timestamptz,boolean,text) to authenticated;

commit;
