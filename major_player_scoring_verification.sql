-- Player-owned Major scorecards, protected admin verification, and read-only live results.
alter table public.major_play_days
  add column if not exists scoring_entry_open boolean not null default false,
  add column if not exists scoring_finalized_at timestamptz,
  add column if not exists scoring_finalized_by uuid;

create table if not exists public.major_player_scorecards (
  id uuid primary key default gen_random_uuid(),
  major_event_id uuid not null references public.major_events(id) on delete cascade,
  play_day_id uuid not null references public.major_play_days(id) on delete cascade,
  entry_id uuid not null references public.major_entries(id) on delete cascade,
  player_id uuid not null references public.players(id),
  player_screen_name_snapshot text not null,
  course_code text not null,
  status text not null default 'draft',
  submitted_at timestamptz,
  submitted_by uuid references public.players(id),
  verified_at timestamptz,
  verified_by uuid,
  verification_notes text,
  scoring_participant_id uuid references public.major_scoring_participants(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entry_id, play_day_id)
);

alter table public.major_player_scorecards drop constraint if exists major_player_scorecards_course_check;
alter table public.major_player_scorecards add constraint major_player_scorecards_course_check check (course_code in ('CBE','CBH'));
alter table public.major_player_scorecards drop constraint if exists major_player_scorecards_status_check;
alter table public.major_player_scorecards add constraint major_player_scorecards_status_check check (status in ('draft','submitted','verified','reopened'));

create table if not exists public.major_player_scorecard_holes (
  scorecard_id uuid not null references public.major_player_scorecards(id) on delete cascade,
  hole_number integer not null check (hole_number between 1 and 18),
  par integer not null check (par between 1 and 20),
  strokes integer not null check (strokes between 1 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (scorecard_id, hole_number)
);

create table if not exists public.major_scorecard_audit_log (
  id bigint generated always as identity primary key,
  scorecard_id uuid not null references public.major_player_scorecards(id) on delete cascade,
  action text not null,
  actor_player_id uuid references public.players(id),
  previous_status text,
  next_status text,
  score_snapshot jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.major_round_standing_snapshots (
  play_day_id uuid not null references public.major_play_days(id) on delete cascade,
  entry_id uuid not null references public.major_entries(id) on delete cascade,
  major_event_id uuid not null references public.major_events(id) on delete cascade,
  weekend_field text not null default 'qualifying',
  round_position integer not null check (round_position > 0),
  overall_position integer not null check (overall_position > 0),
  round_strokes integer not null,
  cumulative_strokes integer not null,
  captured_at timestamptz not null default now(),
  primary key (play_day_id, entry_id)
);
alter table public.major_round_standing_snapshots add column if not exists weekend_field text not null default 'qualifying';

create index if not exists major_player_scorecards_event_day_status_idx on public.major_player_scorecards(major_event_id,play_day_id,status);
create index if not exists major_scorecard_audit_card_idx on public.major_scorecard_audit_log(scorecard_id,created_at);

alter table public.major_player_scorecards enable row level security;
alter table public.major_player_scorecard_holes enable row level security;
alter table public.major_scorecard_audit_log enable row level security;
alter table public.major_round_standing_snapshots enable row level security;
revoke all on public.major_player_scorecards, public.major_player_scorecard_holes, public.major_scorecard_audit_log, public.major_round_standing_snapshots from public, anon, authenticated;

drop policy if exists "Site admins read Major player scorecards" on public.major_player_scorecards;
create policy "Site admins read Major player scorecards" on public.major_player_scorecards for select to authenticated using (public.is_current_user_site_admin());
drop policy if exists "Site admins read Major player holes" on public.major_player_scorecard_holes;
create policy "Site admins read Major player holes" on public.major_player_scorecard_holes for select to authenticated using (public.is_current_user_site_admin());

create or replace function public.current_major_player_id() returns uuid language plpgsql stable security definer set search_path to '' as $f$
declare provider_id text; matched_count integer; matched_player_id uuid;
begin
  if auth.uid() is null or (coalesce(auth.jwt()->'app_metadata'->>'provider','')<>'discord' and not (coalesce(auth.jwt()->'app_metadata'->'providers','[]'::jsonb) ? 'discord')) then return null; end if;
  provider_id:=coalesce(nullif(btrim(auth.jwt()->'user_metadata'->>'provider_id'),''),nullif(btrim(auth.jwt()->'user_metadata'->>'sub'),''));
  if provider_id is null then return null; end if;
  select count(*) into matched_count from public.players where discord_id=provider_id;
  if matched_count<>1 then return null; end if;
  select id into strict matched_player_id from public.players where discord_id=provider_id;
  return matched_player_id;
end $f$;
revoke all on function public.current_major_player_id() from public,anon,authenticated;

create or replace function public.set_major_round_scoring_state(p_play_day_id uuid,p_is_open boolean) returns void language plpgsql security definer set search_path to '' as $f$
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  update public.major_play_days set scoring_entry_open=p_is_open where id=p_play_day_id;
  if not found then raise exception 'Major play day not found'; end if;
end $f$;
revoke all on function public.set_major_round_scoring_state(uuid,boolean) from public,anon,authenticated;

create or replace function public.get_my_major_scorecards(p_major_event_id uuid) returns jsonb language sql stable security definer set search_path to '' as $f$
with me as (select public.current_major_player_id() id), e as (
 select e.* from public.major_entries e,me where e.major_event_id=p_major_event_id and e.player_id=me.id and e.status in ('registered','confirmed')
), cards as (
 select d.id play_day_id,d.day_number,d.label,d.scoring_entry_open,
  case when d.day_number<=2 then 'CBE' else 'CBH' end course_code,
  c.id,c.status,c.submitted_at,c.verified_at,c.verification_notes,
  coalesce((select jsonb_agg(jsonb_build_object('hole_number',h.hole_number,'par',h.par,'strokes',h.strokes) order by h.hole_number) from public.major_player_scorecard_holes h where h.scorecard_id=c.id),'[]'::jsonb) holes
 from e join public.major_play_days d on d.major_event_id=e.major_event_id left join public.major_player_scorecards c on c.entry_id=e.id and c.play_day_id=d.id
)
select coalesce(jsonb_agg(to_jsonb(cards) order by day_number),'[]'::jsonb) from cards
$f$;
revoke all on function public.get_my_major_scorecards(uuid) from public,anon,authenticated;

create or replace function public.save_my_major_scorecard(p_play_day_id uuid,p_holes jsonb) returns uuid language plpgsql security definer set search_path to '' as $f$
declare me uuid; ent public.major_entries; day public.major_play_days; card uuid; item jsonb; pars integer[];
begin
 me:=public.current_major_player_id(); if me is null then raise exception 'Canonical player identity is required' using errcode='42501'; end if;
 select * into day from public.major_play_days where id=p_play_day_id; if not found or not day.scoring_entry_open then raise exception 'Score entry is not open for this round'; end if;
 select * into ent from public.major_entries where major_event_id=day.major_event_id and player_id=me and status in ('registered','confirmed'); if not found then raise exception 'You are not entered in this Major'; end if;
 if not exists(select 1 from public.major_entry_day_choices dc where dc.entry_id=ent.id and dc.play_day_id=day.id) then raise exception 'A scheduled day choice is required'; end if;
 insert into public.major_player_scorecards(major_event_id,play_day_id,entry_id,player_id,player_screen_name_snapshot,course_code)
 values(day.major_event_id,day.id,ent.id,me,ent.player_screen_name_snapshot,case when day.day_number<=2 then 'CBE' else 'CBH' end)
 on conflict(entry_id,play_day_id) do update set updated_at=now() where public.major_player_scorecards.status in ('draft','reopened') returning id into card;
 if card is null then raise exception 'Submitted or verified scorecards cannot be silently changed'; end if;
 pars:=case when day.day_number<=2 then array[3,4,3,4,3,3,3,4,3,5,3,4,2,3,3,3,3,7] else array[3,4,3,4,3,3,3,4,3,8,3,3,2,4,3,4,4,6] end;
 if jsonb_typeof(p_holes)<>'array' then raise exception 'Holes must be an array'; end if;
 delete from public.major_player_scorecard_holes where scorecard_id=card;
 for item in select value from jsonb_array_elements(p_holes) loop
  if (item->>'hole_number')::integer not between 1 and 18 or (item->>'strokes')::integer not between 1 and 99 then raise exception 'Invalid hole score'; end if;
  insert into public.major_player_scorecard_holes(scorecard_id,hole_number,par,strokes) values(card,(item->>'hole_number')::integer,pars[(item->>'hole_number')::integer],(item->>'strokes')::integer);
 end loop; return card;
end $f$;
revoke all on function public.save_my_major_scorecard(uuid,jsonb) from public,anon,authenticated;

create or replace function public.submit_my_major_scorecard(p_scorecard_id uuid) returns void language plpgsql security definer set search_path to '' as $f$
declare me uuid:=public.current_major_player_id(); old text; snap jsonb;
begin
 select status into old from public.major_player_scorecards where id=p_scorecard_id and player_id=me for update;
 if old not in ('draft','reopened') then raise exception 'This scorecard cannot be submitted'; end if;
 if (select count(*) from public.major_player_scorecard_holes where scorecard_id=p_scorecard_id)<>18 then raise exception 'Enter all 18 holes before submitting'; end if;
 select jsonb_agg(to_jsonb(h) order by h.hole_number) into snap from public.major_player_scorecard_holes h where h.scorecard_id=p_scorecard_id;
 update public.major_player_scorecards set status='submitted',submitted_at=now(),submitted_by=me,updated_at=now() where id=p_scorecard_id;
 insert into public.major_scorecard_audit_log(scorecard_id,action,actor_player_id,previous_status,next_status,score_snapshot) values(p_scorecard_id,'submitted',me,old,'submitted',snap);
end $f$;
revoke all on function public.submit_my_major_scorecard(uuid) from public,anon,authenticated;

create or replace function public.verify_major_scorecard(p_scorecard_id uuid,p_notes text default null) returns void language plpgsql security definer set search_path to '' as $f$
declare admin_player uuid:=public.current_major_player_id(); admin_user uuid:=auth.uid(); old text; snap jsonb; participant uuid;
begin
 if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
 select status,scoring_participant_id into old,participant from public.major_player_scorecards where id=p_scorecard_id for update;
 if old<>'submitted' then raise exception 'Only submitted scorecards can be verified'; end if;
 select jsonb_agg(to_jsonb(h) order by h.hole_number) into snap from public.major_player_scorecard_holes h where h.scorecard_id=p_scorecard_id;
 update public.major_player_scorecards set status='verified',verified_at=now(),verified_by=admin_user,verification_notes=nullif(btrim(p_notes),''),updated_at=now() where id=p_scorecard_id;
 insert into public.major_scorecard_audit_log(scorecard_id,action,actor_player_id,previous_status,next_status,score_snapshot,notes) values(p_scorecard_id,'verified',admin_player,old,'verified',snap,p_notes);
 if participant is not null then insert into public.major_hole_scores(session_id,participant_id,hole_number,strokes) select p.session_id,participant,h.hole_number,h.strokes from public.major_player_scorecard_holes h join public.major_scoring_participants p on p.id=participant where h.scorecard_id=p_scorecard_id on conflict(session_id,participant_id,hole_number) do update set strokes=excluded.strokes; end if;
end $f$;
revoke all on function public.verify_major_scorecard(uuid,text) from public,anon,authenticated;

create or replace function public.reopen_major_scorecard(p_scorecard_id uuid,p_notes text) returns void language plpgsql security definer set search_path to '' as $f$
declare old text; admin_player uuid:=public.current_major_player_id(); snap jsonb;
begin
 if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
 select status into old from public.major_player_scorecards where id=p_scorecard_id for update; if old not in ('submitted','verified') then raise exception 'Scorecard cannot be reopened'; end if;
 select jsonb_agg(to_jsonb(h) order by h.hole_number) into snap from public.major_player_scorecard_holes h where h.scorecard_id=p_scorecard_id;
 update public.major_player_scorecards set status='reopened',verified_at=null,verified_by=null,verification_notes=nullif(btrim(p_notes),''),updated_at=now() where id=p_scorecard_id;
 insert into public.major_scorecard_audit_log(scorecard_id,action,actor_player_id,previous_status,next_status,score_snapshot,notes) values(p_scorecard_id,'reopened',admin_player,old,'reopened',snap,p_notes);
end $f$;
revoke all on function public.reopen_major_scorecard(uuid,text) from public,anon,authenticated;

create or replace function public.finalize_major_scoring_round(p_play_day_id uuid) returns void language plpgsql security definer set search_path to '' as $f$
declare event_id uuid; round_day integer;
begin
 if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
 select major_event_id,day_number into event_id,round_day from public.major_play_days where id=p_play_day_id for update; if not found then raise exception 'Play day not found'; end if;
 if exists(
   select 1 from public.major_entries e
   where e.major_event_id=event_id and e.status in ('registered','confirmed')
   and not exists(select 1 from public.major_player_scorecards c where c.entry_id=e.id and c.play_day_id=p_play_day_id and c.status='verified')
 ) then raise exception 'Every required entrant must submit and be verified before finalizing'; end if;
 insert into public.major_round_standing_snapshots(play_day_id,entry_id,major_event_id,weekend_field,round_position,overall_position,round_strokes,cumulative_strokes)
 with totals as (
  select c.entry_id,case when round_day<=2 then 'qualifying' else coalesce(w.competition_status,'pending') end weekend_field,sum(h.strokes)::int round_strokes
  from public.major_player_scorecards c join public.major_player_scorecard_holes h on h.scorecard_id=c.id left join public.major_entry_weekend_status w on w.entry_id=c.entry_id
  where c.play_day_id=p_play_day_id and c.status='verified' group by c.entry_id,w.competition_status
 ), cumulative as (
  select c.entry_id,sum(h.strokes)::int cumulative_strokes from public.major_player_scorecards c join public.major_play_days d on d.id=c.play_day_id join public.major_player_scorecard_holes h on h.scorecard_id=c.id
  where c.major_event_id=event_id and c.status='verified' and d.day_number<=round_day group by c.entry_id
 )
 select p_play_day_id,t.entry_id,event_id,t.weekend_field,dense_rank() over(partition by t.weekend_field order by t.round_strokes),dense_rank() over(partition by t.weekend_field order by c.cumulative_strokes),t.round_strokes,c.cumulative_strokes from totals t join cumulative c using(entry_id)
 on conflict(play_day_id,entry_id) do nothing;
 update public.major_play_days set scoring_entry_open=false,scoring_finalized_at=now(),scoring_finalized_by=auth.uid() where id=p_play_day_id;
end $f$;
revoke all on function public.finalize_major_scoring_round(uuid) from public,anon,authenticated;

create or replace function public.get_public_major_live_results(p_major_event_id uuid) returns jsonb language sql stable security definer set search_path to '' as $f$
select jsonb_build_object(
 'event',jsonb_build_object('id',e.id,'slug',e.slug,'name',e.name,'year',e.year,'is_test_event',e.is_test_event),
 'notice','SCORES ARE UNOFFICIAL UNTIL VERIFIED.',
 'active_day_number',(select min(day_number) from public.major_play_days where major_event_id=e.id and scoring_entry_open),
 'rounds',coalesce((select jsonb_agg(jsonb_build_object(
   'play_day_id',d.id,'day_number',d.day_number,'label',d.label,'course_code',case when d.day_number<=2 then 'CBE' else 'CBH' end,
   'is_entry_open',d.scoring_entry_open,'is_finalized',d.scoring_finalized_at is not null,
   'cards',coalesce((select jsonb_agg(jsonb_build_object(
     'id',c.id,'major_event_id',c.major_event_id,'play_day_id',c.play_day_id,'entry_id',c.entry_id,'player_id',c.player_id,
     'player_screen_name_snapshot',c.player_screen_name_snapshot,'day_number',d.day_number,'day_label',d.label,'course_code',c.course_code,
     'weekend_field',case when d.day_number<=2 then 'qualifying' else coalesce((select w.competition_status from public.major_entry_weekend_status w where w.entry_id=c.entry_id),'pending') end,
     'status',c.status,'submitted_at',c.submitted_at,'verified_at',c.verified_at,'verification_notes',c.verification_notes,
     'total_strokes',(select sum(h.strokes) from public.major_player_scorecard_holes h where h.scorecard_id=c.id),
     'score_to_par',(select sum(h.strokes-h.par) from public.major_player_scorecard_holes h where h.scorecard_id=c.id),
     'holes',(select jsonb_agg(jsonb_build_object('hole_number',h.hole_number,'par',h.par,'strokes',h.strokes) order by h.hole_number) from public.major_player_scorecard_holes h where h.scorecard_id=c.id)
   ) order by (select sum(h.strokes) from public.major_player_scorecard_holes h where h.scorecard_id=c.id))
   from public.major_player_scorecards c where c.play_day_id=d.id and c.status in ('submitted','verified')),'[]'::jsonb)
 ) order by d.day_number) from public.major_play_days d where d.major_event_id=e.id),'[]'::jsonb),
 'snapshots',coalesce((select jsonb_agg(to_jsonb(s)) from public.major_round_standing_snapshots s where s.major_event_id=e.id),'[]'::jsonb)
) from public.major_events e where e.id=p_major_event_id and (
 (not e.is_test_event and e.is_public)
 or (e.is_test_event and auth.uid() is not null and (
   public.is_current_user_site_admin()
   or exists(select 1 from public.major_test_event_testers t where t.major_event_id=e.id and t.player_id=public.current_major_player_id())
 ))
)
$f$;
revoke all on function public.get_public_major_live_results(uuid) from public,anon,authenticated;

create or replace function public.get_public_major_hole_in_one_history() returns jsonb language sql stable security definer set search_path to '' as $f$
select coalesce(jsonb_agg(to_jsonb(r) order by r.holes_in_one desc,r.player_screen_name_snapshot),'[]'::jsonb)
from (
 select c.player_id,max(c.player_screen_name_snapshot) player_screen_name_snapshot,count(*)::integer holes_in_one
 from public.major_player_scorecards c
 join public.major_events e on e.id=c.major_event_id and not e.is_test_event
 join public.major_player_scorecard_holes h on h.scorecard_id=c.id and h.strokes=1
 where c.status='verified'
 group by c.player_id
) r
$f$;
revoke all on function public.get_public_major_hole_in_one_history() from public,anon,authenticated;

create or replace function public.get_major_scorecard_verification_queue(p_major_event_id uuid) returns jsonb language sql stable security definer set search_path to '' as $f$
select case when public.is_current_user_site_admin() then coalesce(jsonb_agg(jsonb_build_object(
 'id',c.id,'major_event_id',c.major_event_id,'play_day_id',c.play_day_id,'entry_id',c.entry_id,'player_id',c.player_id,
 'player_screen_name_snapshot',c.player_screen_name_snapshot,'course_code',c.course_code,'status',c.status,'submitted_at',c.submitted_at,
 'submitted_by',c.submitted_by,'verified_at',c.verified_at,'verified_by',c.verified_by,'verification_notes',c.verification_notes,
 'day_number',d.day_number,'day_label',d.label,'slot_starts_at',slot.starts_at,'room_label',grp.group_label,
 'total_strokes',(select sum(h.strokes) from public.major_player_scorecard_holes h where h.scorecard_id=c.id),
 'score_to_par',(select sum(h.strokes-h.par) from public.major_player_scorecard_holes h where h.scorecard_id=c.id),
 'holes',(select jsonb_agg(jsonb_build_object('hole_number',h.hole_number,'par',h.par,'strokes',h.strokes) order by h.hole_number) from public.major_player_scorecard_holes h where h.scorecard_id=c.id)
) order by c.submitted_at desc),'[]'::jsonb) else '[]'::jsonb end
from public.major_player_scorecards c join public.major_play_days d on d.id=c.play_day_id
left join public.major_entry_day_choices choice on choice.entry_id=c.entry_id and choice.play_day_id=c.play_day_id
left join public.major_time_slots slot on slot.id=choice.time_slot_id
left join public.major_schedule_group_members gm on gm.entry_id=c.entry_id and gm.play_day_id=c.play_day_id
left join public.major_schedule_groups grp on grp.id=gm.group_id
where c.major_event_id=p_major_event_id
$f$;
revoke all on function public.get_major_scorecard_verification_queue(uuid) from public,anon,authenticated;

grant execute on function public.get_my_major_scorecards(uuid),public.save_my_major_scorecard(uuid,jsonb),public.submit_my_major_scorecard(uuid) to authenticated;
grant execute on function public.set_major_round_scoring_state(uuid,boolean),public.verify_major_scorecard(uuid,text),public.reopen_major_scorecard(uuid,text),public.finalize_major_scoring_round(uuid),public.get_major_scorecard_verification_queue(uuid) to authenticated;
grant execute on function public.get_public_major_live_results(uuid) to anon,authenticated;
grant execute on function public.get_public_major_hole_in_one_history() to anon,authenticated;
grant select on public.major_player_scorecards,public.major_player_scorecard_holes to authenticated;
