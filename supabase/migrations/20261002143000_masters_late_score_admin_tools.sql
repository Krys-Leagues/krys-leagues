begin;

create table if not exists public.major_score_entry_admin_actions (
  id uuid primary key default gen_random_uuid(),
  major_event_id uuid not null references public.major_events(id) on delete restrict,
  play_day_id uuid not null references public.major_play_days(id) on delete restrict,
  entry_id uuid not null references public.major_entries(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  scorecard_id uuid references public.major_player_scorecards(id) on delete restrict,
  action text not null check (action in ('admin_score_entry_reopen', 'admin_score_entry')),
  actor_user_id uuid not null,
  actor_player_id uuid references public.players(id) on delete set null,
  actor_screen_name_snapshot text not null,
  prior_access_state text not null,
  expires_at timestamptz,
  reason text,
  score_snapshot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  check (
    (action = 'admin_score_entry_reopen' and expires_at is not null)
    or (action = 'admin_score_entry' and expires_at is null)
  )
);

create index if not exists major_score_entry_admin_actions_reopen_idx
  on public.major_score_entry_admin_actions(entry_id, play_day_id, expires_at desc)
  where action = 'admin_score_entry_reopen';

create index if not exists major_score_entry_admin_actions_event_idx
  on public.major_score_entry_admin_actions(major_event_id, created_at desc);

alter table public.major_score_entry_admin_actions enable row level security;
revoke all on table public.major_score_entry_admin_actions from public, anon, authenticated;

create or replace function public.major_active_score_reopen_until(
  p_entry_id uuid,
  p_play_day_id uuid
)
returns timestamptz
language sql
stable
security definer
set search_path to ''
as $function$
select max(action.expires_at)
from public.major_score_entry_admin_actions action
where action.entry_id = p_entry_id
  and action.play_day_id = p_play_day_id
  and action.action = 'admin_score_entry_reopen'
  and action.expires_at > now()
$function$;

revoke all on function public.major_active_score_reopen_until(uuid, uuid)
from public, anon, authenticated;

create or replace function public.get_my_major_scorecards(p_major_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
with me as (
  select public.current_major_player_id() as id
), entry as (
  select major_entry.*
  from public.major_entries major_entry, me
  where major_entry.major_event_id = p_major_event_id
    and major_entry.player_id = me.id
    and major_entry.status in ('registered', 'confirmed')
), rounds as (
  select
    day.id as play_day_id,
    day.day_number,
    day.label,
    day.play_date,
    entry.id as entry_id,
    entry.major_event_id,
    entry.player_id,
    entry.player_screen_name_snapshot,
    case when day.day_number <= 2 then 'CBE' else 'CBH' end as course_code,
    card.id,
    card.status,
    card.submitted_at,
    card.submitted_by,
    card.verified_at,
    card.verified_by,
    null::text as verifier_screen_name,
    card.verification_notes,
    (select sum(hole.strokes) from public.major_player_scorecard_holes hole where hole.scorecard_id = card.id) as total_strokes,
    (select sum(hole.strokes - hole.par) from public.major_player_scorecard_holes hole where hole.scorecard_id = card.id) as score_to_par,
    scoring_window.room_group_id,
    scoring_window.room_label,
    scoring_window.room_start_at as slot_starts_at,
    (select room.instructions from public.major_schedule_groups room where room.id = scoring_window.room_group_id) as room_instructions,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'player_id', room_entry.player_id,
          'player_screen_name_snapshot', room_entry.player_screen_name_snapshot
        )
        order by room_entry.player_screen_name_snapshot, room_entry.player_id
      )
      from public.major_schedule_group_members room_member
      join public.major_entries room_entry on room_entry.id = room_member.entry_id
      where room_member.group_id = scoring_window.room_group_id
    ), '[]'::jsonb) as room_roster,
    case when day.day_number <= 2 then 'qualifying'
      else coalesce((select weekend.competition_status from public.major_entry_weekend_status weekend where weekend.entry_id = entry.id), 'pending')
    end as weekend_field,
    scoring_window.room_start_at,
    scoring_window.round_closes_at,
    public.major_active_score_reopen_until(entry.id, day.id) as admin_reopened_until,
    case when scoring_window.room_start_at is null then null
      else scoring_window.room_start_at - interval '3 hours'
    end as score_visible_at,
    case
      when scoring_window.room_start_at is null then 'hidden'
      when now() < scoring_window.room_start_at - interval '3 hours' then 'hidden'
      when now() < scoring_window.room_start_at then 'upcoming'
      when day.scoring_finalized_at is null and (
        now() <= scoring_window.round_closes_at
        or public.major_active_score_reopen_until(entry.id, day.id) > now()
      ) then 'open'
      else 'closed'
    end as score_access_state,
    coalesce(
      now() >= scoring_window.room_start_at
      and day.scoring_finalized_at is null
      and (
        now() <= scoring_window.round_closes_at
        or public.major_active_score_reopen_until(entry.id, day.id) > now()
      ),
      false
    ) as scoring_entry_open,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'hole_number', hole.hole_number,
          'par', hole.par,
          'strokes', hole.strokes
        )
        order by hole.hole_number
      )
      from public.major_player_scorecard_holes hole
      where hole.scorecard_id = card.id
    ), '[]'::jsonb) as holes
  from entry
  join public.major_play_days day on day.major_event_id = entry.major_event_id
  left join public.major_player_scorecards card
    on card.entry_id = entry.id
   and card.play_day_id = day.id
  left join lateral public.major_player_round_scoring_window(entry.player_id, day.id) scoring_window on true
)
select coalesce(jsonb_agg(to_jsonb(rounds) order by day_number), '[]'::jsonb)
from rounds
$function$;

revoke all on function public.get_my_major_scorecards(uuid)
from public, anon, authenticated;
grant execute on function public.get_my_major_scorecards(uuid)
to authenticated;

create or replace function public.save_my_major_scorecard(
  p_play_day_id uuid,
  p_holes jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  me uuid;
  entry public.major_entries;
  day public.major_play_days;
  card uuid;
  item jsonb;
  pars integer[];
  scoring_window record;
  reopened_until timestamptz;
begin
  me := public.current_major_player_id();
  if me is null then
    raise exception 'Canonical player identity is required' using errcode = '42501';
  end if;

  select * into day from public.major_play_days where id = p_play_day_id;
  if not found then raise exception 'Major play day not found'; end if;

  select * into entry
  from public.major_entries
  where major_event_id = day.major_event_id
    and player_id = me
    and status in ('registered', 'confirmed');
  if not found then raise exception 'You are not entered in this Major'; end if;

  select * into scoring_window
  from public.major_player_round_scoring_window(me, day.id);
  if not found then raise exception 'A complete published room assignment is required'; end if;
  if now() < scoring_window.room_start_at then raise exception 'Your room has not started yet'; end if;

  reopened_until := public.major_active_score_reopen_until(entry.id, day.id);
  if day.scoring_finalized_at is not null
     or (now() > scoring_window.round_closes_at and coalesce(reopened_until <= now(), true)) then
    raise exception 'Score entry is closed for this round';
  end if;

  if jsonb_typeof(p_holes) <> 'array' then raise exception 'Holes must be an array'; end if;

  insert into public.major_player_scorecards (
    major_event_id, play_day_id, entry_id, player_id, player_screen_name_snapshot, course_code
  ) values (
    day.major_event_id, day.id, entry.id, me, entry.player_screen_name_snapshot,
    case when day.day_number <= 2 then 'CBE' else 'CBH' end
  )
  on conflict (entry_id, play_day_id) do update
    set updated_at = now()
    where public.major_player_scorecards.status in ('draft', 'reopened')
  returning id into card;

  if card is null then raise exception 'Submitted or verified scorecards cannot be silently changed'; end if;

  pars := case when day.day_number <= 2
    then array[3,4,3,4,3,3,3,4,3,5,3,4,2,3,3,3,3,7]
    else array[3,4,3,4,3,3,3,4,3,5,3,4,2,3,3,3,3,8]
  end;

  delete from public.major_player_scorecard_holes where scorecard_id = card;
  for item in select value from jsonb_array_elements(p_holes) loop
    if (item->>'hole_number')::integer not between 1 and 18
       or (item->>'strokes')::integer not between 1 and 99 then
      raise exception 'Invalid hole score';
    end if;
    insert into public.major_player_scorecard_holes (scorecard_id, hole_number, par, strokes)
    values (card, (item->>'hole_number')::integer, pars[(item->>'hole_number')::integer], (item->>'strokes')::integer);
  end loop;

  return card;
end
$function$;

revoke all on function public.save_my_major_scorecard(uuid, jsonb)
from public, anon, authenticated;
grant execute on function public.save_my_major_scorecard(uuid, jsonb)
to authenticated;

create or replace function public.submit_my_major_scorecard(p_scorecard_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  me uuid := public.current_major_player_id();
  old_status text;
  score_snapshot jsonb;
  card public.major_player_scorecards;
  day public.major_play_days;
  scoring_window record;
  reopened_until timestamptz;
begin
  select * into card
  from public.major_player_scorecards
  where id = p_scorecard_id and player_id = me
  for update;

  if not found or card.status not in ('draft', 'reopened') then
    raise exception 'This scorecard cannot be submitted';
  end if;
  old_status := card.status;

  select * into day from public.major_play_days where id = card.play_day_id;
  select * into scoring_window from public.major_player_round_scoring_window(me, card.play_day_id);
  if not found then raise exception 'A complete published room assignment is required'; end if;
  if now() < scoring_window.room_start_at then raise exception 'Your room has not started yet'; end if;

  reopened_until := public.major_active_score_reopen_until(card.entry_id, card.play_day_id);
  if day.scoring_finalized_at is not null
     or (now() > scoring_window.round_closes_at and coalesce(reopened_until <= now(), true)) then
    raise exception 'Score entry is closed for this round';
  end if;

  if (select count(*) from public.major_player_scorecard_holes where scorecard_id = p_scorecard_id) <> 18 then
    raise exception 'Enter all 18 holes before submitting';
  end if;

  select jsonb_agg(to_jsonb(hole) order by hole.hole_number)
  into score_snapshot
  from public.major_player_scorecard_holes hole
  where hole.scorecard_id = p_scorecard_id;

  update public.major_player_scorecards
  set status = 'submitted', submitted_at = now(), submitted_by = me, updated_at = now()
  where id = p_scorecard_id;

  insert into public.major_scorecard_audit_log (
    scorecard_id, action, actor_player_id, previous_status, next_status, score_snapshot
  ) values (p_scorecard_id, 'submitted', me, old_status, 'submitted', score_snapshot);
end
$function$;

revoke all on function public.submit_my_major_scorecard(uuid)
from public, anon, authenticated;
grant execute on function public.submit_my_major_scorecard(uuid)
to authenticated;

create or replace function public.admin_reopen_major_score_entry_service(
  p_major_event_id uuid,
  p_play_day_id uuid,
  p_entry_id uuid,
  p_actor_user_id uuid,
  p_actor_player_id uuid,
  p_actor_screen_name text,
  p_reason text default null
)
returns timestamptz
language plpgsql
security definer
set search_path to ''
as $function$
declare
  target_entry public.major_entries;
  target_day public.major_play_days;
  scoring_window record;
  existing_status text;
  reopened_until timestamptz := now() + interval '1 hour';
begin
  if p_actor_user_id is null or nullif(btrim(p_actor_screen_name), '') is null then
    raise exception 'Authorized admin provenance is required' using errcode = '42501';
  end if;
  if length(coalesce(p_reason, '')) > 1000 then raise exception 'Reason is too long'; end if;
  if not exists (
    select 1 from public.major_events
    where id = p_major_event_id and slug = 'masters'
  ) then
    raise exception 'The late-score tool is restricted to the Masters event';
  end if;

  select * into target_entry
  from public.major_entries
  where id = p_entry_id and major_event_id = p_major_event_id and status in ('registered', 'confirmed');
  if not found then raise exception 'Active Masters entrant not found'; end if;

  select * into target_day
  from public.major_play_days
  where id = p_play_day_id and major_event_id = p_major_event_id;
  if not found then raise exception 'Masters round not found'; end if;
  if target_day.scoring_finalized_at is not null then raise exception 'This round is finalized and cannot be reopened'; end if;

  select * into scoring_window
  from public.major_player_round_scoring_window(target_entry.player_id, target_day.id);
  if not found then raise exception 'A complete published room assignment is required'; end if;
  if now() <= scoring_window.round_closes_at then raise exception 'This player is still inside the normal scoring window'; end if;

  select status into existing_status
  from public.major_player_scorecards
  where entry_id = target_entry.id and play_day_id = target_day.id;
  if existing_status in ('submitted', 'verified') then
    raise exception 'Submitted or verified scorecards cannot be reopened through the late-entry tool';
  end if;

  insert into public.major_score_entry_admin_actions (
    major_event_id, play_day_id, entry_id, player_id, scorecard_id, action,
    actor_user_id, actor_player_id, actor_screen_name_snapshot,
    prior_access_state, expires_at, reason
  ) values (
    p_major_event_id, p_play_day_id, target_entry.id, target_entry.player_id,
    (select id from public.major_player_scorecards where entry_id = target_entry.id and play_day_id = target_day.id),
    'admin_score_entry_reopen', p_actor_user_id, p_actor_player_id,
    btrim(p_actor_screen_name), 'closed_after_normal_deadline', reopened_until,
    nullif(btrim(p_reason), '')
  );

  return reopened_until;
end
$function$;

revoke all on function public.admin_reopen_major_score_entry_service(uuid, uuid, uuid, uuid, uuid, text, text)
from public, anon, authenticated;
grant execute on function public.admin_reopen_major_score_entry_service(uuid, uuid, uuid, uuid, uuid, text, text)
to service_role;

create or replace function public.admin_submit_major_scorecard_service(
  p_major_event_id uuid,
  p_play_day_id uuid,
  p_entry_id uuid,
  p_holes jsonb,
  p_actor_user_id uuid,
  p_actor_player_id uuid,
  p_actor_screen_name text,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  target_entry public.major_entries;
  target_day public.major_play_days;
  scoring_window record;
  existing_card public.major_player_scorecards;
  card_id uuid;
  prior_status text;
  prior_access text;
  pars integer[];
  score_snapshot jsonb;
begin
  if p_actor_user_id is null or nullif(btrim(p_actor_screen_name), '') is null then
    raise exception 'Authorized admin provenance is required' using errcode = '42501';
  end if;
  if length(coalesce(p_reason, '')) > 1000 then raise exception 'Reason is too long'; end if;
  if not exists (
    select 1 from public.major_events
    where id = p_major_event_id and slug = 'masters'
  ) then
    raise exception 'The late-score tool is restricted to the Masters event';
  end if;

  select * into target_entry
  from public.major_entries
  where id = p_entry_id and major_event_id = p_major_event_id and status in ('registered', 'confirmed');
  if not found then raise exception 'Active Masters entrant not found'; end if;

  select * into target_day
  from public.major_play_days
  where id = p_play_day_id and major_event_id = p_major_event_id;
  if not found then raise exception 'Masters round not found'; end if;
  if target_day.scoring_finalized_at is not null then raise exception 'This round is finalized and cannot accept a late score'; end if;

  select * into scoring_window
  from public.major_player_round_scoring_window(target_entry.player_id, target_day.id);
  if not found then raise exception 'A complete published room assignment is required'; end if;
  if now() <= scoring_window.round_closes_at then
    raise exception 'This player is still inside the normal scoring window';
  end if;

  select * into existing_card
  from public.major_player_scorecards
  where entry_id = target_entry.id and play_day_id = target_day.id
  for update;
  prior_status := case when found then existing_card.status else null end;
  if prior_status in ('submitted', 'verified') then
    raise exception 'Submitted or verified scorecards cannot be overwritten';
  end if;

  if jsonb_typeof(p_holes) <> 'array'
     or jsonb_array_length(p_holes) <> 18
     or (select count(distinct (item->>'hole_number')::integer) from jsonb_array_elements(p_holes) item) <> 18
     or exists (
       select 1 from jsonb_array_elements(p_holes) item
       where (item->>'hole_number')::integer not between 1 and 18
          or (item->>'strokes')::integer not between 1 and 99
     ) then
    raise exception 'Enter one valid score for each of the 18 holes';
  end if;

  pars := case when target_day.day_number <= 2
    then array[3,4,3,4,3,3,3,4,3,5,3,4,2,3,3,3,3,7]
    else array[3,4,3,4,3,3,3,4,3,5,3,4,2,3,3,3,3,8]
  end;
  prior_access := case
    when now() < scoring_window.room_start_at then 'before_room_start'
    when now() <= scoring_window.round_closes_at then 'normal_window_open'
    else 'closed_after_normal_deadline'
  end;

  insert into public.major_player_scorecards (
    major_event_id, play_day_id, entry_id, player_id, player_screen_name_snapshot, course_code
  ) values (
    p_major_event_id, target_day.id, target_entry.id, target_entry.player_id,
    target_entry.player_screen_name_snapshot,
    case when target_day.day_number <= 2 then 'CBE' else 'CBH' end
  )
  on conflict (entry_id, play_day_id) do update
    set updated_at = now()
    where public.major_player_scorecards.status in ('draft', 'reopened')
  returning id into card_id;

  if card_id is null then raise exception 'Submitted or verified scorecards cannot be overwritten'; end if;

  delete from public.major_player_scorecard_holes where scorecard_id = card_id;
  insert into public.major_player_scorecard_holes (scorecard_id, hole_number, par, strokes)
  select card_id, hole_number, pars[hole_number], strokes
  from (
    select (item->>'hole_number')::integer as hole_number,
           (item->>'strokes')::integer as strokes
    from jsonb_array_elements(p_holes) item
  ) scores
  order by hole_number;

  select jsonb_agg(to_jsonb(hole) order by hole.hole_number)
  into score_snapshot
  from public.major_player_scorecard_holes hole
  where hole.scorecard_id = card_id;

  update public.major_player_scorecards
  set status = 'submitted', submitted_at = now(), submitted_by = null,
      verified_at = null, verified_by = null, verification_notes = null, updated_at = now()
  where id = card_id;

  insert into public.major_scorecard_audit_log (
    scorecard_id, action, actor_player_id, previous_status, next_status, score_snapshot, notes
  ) values (
    card_id, 'admin_score_entry', p_actor_player_id, prior_status, 'submitted', score_snapshot,
    nullif(btrim(p_reason), '')
  );

  insert into public.major_score_entry_admin_actions (
    major_event_id, play_day_id, entry_id, player_id, scorecard_id, action,
    actor_user_id, actor_player_id, actor_screen_name_snapshot,
    prior_access_state, reason, score_snapshot
  ) values (
    p_major_event_id, p_play_day_id, target_entry.id, target_entry.player_id, card_id,
    'admin_score_entry', p_actor_user_id, p_actor_player_id,
    btrim(p_actor_screen_name), prior_access, nullif(btrim(p_reason), ''), score_snapshot
  );

  return card_id;
end
$function$;

revoke all on function public.admin_submit_major_scorecard_service(uuid, uuid, uuid, jsonb, uuid, uuid, text, text)
from public, anon, authenticated;
grant execute on function public.admin_submit_major_scorecard_service(uuid, uuid, uuid, jsonb, uuid, uuid, text, text)
to service_role;

commit;
