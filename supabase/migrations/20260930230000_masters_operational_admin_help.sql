begin;

create table if not exists public.major_admin_help_requests (
  id uuid primary key default gen_random_uuid(),
  major_event_id uuid not null references public.major_events(id) on delete restrict,
  play_day_id uuid not null references public.major_play_days(id) on delete restrict,
  entry_id uuid not null references public.major_entries(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  player_screen_name_snapshot text not null,
  schedule_group_id uuid not null references public.major_schedule_groups(id) on delete restrict,
  room_label_snapshot text not null,
  round_number integer not null check (round_number between 1 and 4),
  scheduled_start_at timestamptz not null,
  local_display_time text,
  category text not null check (category in (
    'PLAYER NO-SHOW',
    'CAN''T FIND MY ROOM',
    'SCORECARD PHOTO PROBLEM',
    'SCORE ENTRY PROBLEM',
    'WRONG ROOM OR TIME',
    'WEBSITE / TECHNICAL PROBLEM',
    'OTHER'
  )),
  message text not null check (length(btrim(message)) between 2 and 800),
  submitted_at timestamptz not null default now(),
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'sent', 'failed')),
  delivery_attempted_at timestamptz,
  discord_message_id text,
  delivery_error text,
  context_snapshot jsonb not null default '{}'::jsonb
);

create index if not exists major_admin_help_requests_player_rate_idx
  on public.major_admin_help_requests(player_id, submitted_at desc);
create index if not exists major_admin_help_requests_event_pending_idx
  on public.major_admin_help_requests(major_event_id, delivery_status, submitted_at desc);

create table if not exists public.major_admin_help_deliveries (
  request_id uuid not null references public.major_admin_help_requests(id) on delete restrict,
  admin_player_id uuid not null references public.players(id) on delete restrict,
  admin_label_snapshot text not null,
  admin_screen_name_snapshot text not null,
  discord_user_id_snapshot text not null check (discord_user_id_snapshot ~ '^[0-9]+$'),
  delivery_status text not null check (delivery_status in ('sent', 'failed')),
  delivery_attempted_at timestamptz not null,
  discord_channel_id text,
  discord_message_id text,
  delivery_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (request_id, admin_player_id)
);

create index if not exists major_admin_help_deliveries_status_idx
  on public.major_admin_help_deliveries(delivery_status, delivery_attempted_at desc);
create index if not exists major_admin_help_deliveries_admin_idx
  on public.major_admin_help_deliveries(admin_player_id, delivery_attempted_at desc);

create table if not exists public.major_score_verification_discord_alerts (
  id uuid primary key default gen_random_uuid(),
  major_event_id uuid not null references public.major_events(id) on delete restrict,
  play_day_id uuid not null references public.major_play_days(id) on delete restrict,
  schedule_group_id uuid not null references public.major_schedule_groups(id) on delete restrict,
  discord_channel_id text not null check (discord_channel_id = '1555012516625653840'),
  discord_message_id text,
  last_discord_message_id text,
  status text not null default 'pending' check (status in ('pending', 'active', 'resolved', 'failed')),
  desired_payload_hash text check (desired_payload_hash is null or desired_payload_hash ~ '^[0-9a-f]{64}$'),
  last_payload_hash text check (last_payload_hash is null or last_payload_hash ~ '^[0-9a-f]{64}$'),
  sync_token uuid,
  sync_lease_until timestamptz,
  last_synced_at timestamptz,
  resolved_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (major_event_id, play_day_id, schedule_group_id)
);

create index if not exists major_score_verification_discord_alerts_active_idx
  on public.major_score_verification_discord_alerts(major_event_id, status, updated_at desc);
create index if not exists major_score_verification_discord_alerts_day_idx
  on public.major_score_verification_discord_alerts(play_day_id);
create index if not exists major_score_verification_discord_alerts_room_idx
  on public.major_score_verification_discord_alerts(schedule_group_id);

alter table public.major_admin_help_requests enable row level security;
alter table public.major_admin_help_requests force row level security;
revoke all on table public.major_admin_help_requests from public, anon, authenticated;
grant select, insert, update on table public.major_admin_help_requests to service_role;

alter table public.major_admin_help_deliveries enable row level security;
alter table public.major_admin_help_deliveries force row level security;
revoke all on table public.major_admin_help_deliveries from public, anon, authenticated;
grant select, insert, update on table public.major_admin_help_deliveries to service_role;

alter table public.major_score_verification_discord_alerts enable row level security;
alter table public.major_score_verification_discord_alerts force row level security;
revoke all on table public.major_score_verification_discord_alerts from public, anon, authenticated;
grant select, insert, update on table public.major_score_verification_discord_alerts to service_role;

create or replace function public.create_my_masters_admin_help_request(
  p_major_event_id uuid,
  p_play_day_id uuid,
  p_category text,
  p_message text,
  p_local_display_time text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  me uuid := public.current_major_player_id();
  assignment record;
  other_room jsonb;
  request_id uuid;
  v_submitted_at timestamptz := now();
begin
  if me is null then
    raise exception 'Canonical player identity is required.' using errcode = '42501';
  end if;
  if p_category not in (
    'PLAYER NO-SHOW', 'CAN''T FIND MY ROOM', 'SCORECARD PHOTO PROBLEM',
    'SCORE ENTRY PROBLEM', 'WRONG ROOM OR TIME', 'WEBSITE / TECHNICAL PROBLEM', 'OTHER'
  ) or length(btrim(coalesce(p_message, ''))) not between 2 and 800 then
    raise exception 'Complete the Masters help form before sending.' using errcode = '22023';
  end if;

  select
    event.name as event_name,
    entry.id as entry_id,
    entry.player_screen_name_snapshot,
    day.day_number,
    room.id as room_id,
    room.group_label,
    slot.starts_at
  into assignment
  from public.major_entries entry
  join public.major_events event on event.id = entry.major_event_id
  join public.major_play_days day on day.major_event_id = event.id and day.id = p_play_day_id
  join public.major_entry_day_choices choice on choice.entry_id = entry.id and choice.play_day_id = day.id
  join public.major_time_slots slot on slot.id = choice.time_slot_id and slot.play_day_id = day.id
  join public.major_schedule_group_members member on member.entry_id = entry.id and member.play_day_id = day.id and member.time_slot_id = slot.id
  join public.major_schedule_groups room on room.id = member.group_id and room.is_published
  where event.id = p_major_event_id
    and event.slug = 'masters'
    and entry.player_id = me
    and entry.status in ('registered', 'confirmed')
    and (select count(*) from public.major_schedule_group_members counted where counted.group_id = room.id) between 2 and 4
  limit 1;

  if not found then
    raise exception 'A complete published Masters room assignment is required.' using errcode = '42501';
  end if;

  if (
    select count(*)
    from public.major_admin_help_requests recent
    where recent.player_id = me
      and recent.submitted_at > v_submitted_at - interval '10 minutes'
  ) >= 3 then
    raise exception 'Please wait before sending another Masters admin alert.' using errcode = '42900';
  end if;
  if exists (
    select 1
    from public.major_admin_help_requests recent
    where recent.player_id = me
      and recent.play_day_id = p_play_day_id
      and recent.category = p_category
      and recent.message = btrim(p_message)
      and recent.submitted_at > v_submitted_at - interval '2 minutes'
  ) then
    raise exception 'This Masters admin alert was already sent recently.' using errcode = '23505';
  end if;

  select jsonb_build_object(
    'room_label', alternate.group_label,
    'players', coalesce((
      select jsonb_agg(other_entry.player_screen_name_snapshot order by other_entry.player_screen_name_snapshot)
      from public.major_schedule_group_members other_member
      join public.major_entries other_entry on other_entry.id = other_member.entry_id
      where other_member.group_id = alternate.id
    ), '[]'::jsonb)
  )
  into other_room
  from public.major_schedule_groups alternate
  join public.major_time_slots alternate_slot on alternate_slot.id = alternate.time_slot_id
  where alternate.major_event_id = p_major_event_id
    and alternate.play_day_id = p_play_day_id
    and alternate.id <> assignment.room_id
    and alternate.is_published
    and alternate_slot.starts_at = assignment.starts_at
    and (select count(*) from public.major_schedule_group_members counted where counted.group_id = alternate.id) between 2 and 4
  order by alternate.group_label
  limit 1;

  insert into public.major_admin_help_requests (
    major_event_id, play_day_id, entry_id, player_id, player_screen_name_snapshot,
    schedule_group_id, room_label_snapshot, round_number, scheduled_start_at,
    local_display_time, category, message, submitted_at, context_snapshot
  ) values (
    p_major_event_id, p_play_day_id, assignment.entry_id, me, assignment.player_screen_name_snapshot,
    assignment.room_id, assignment.group_label, assignment.day_number, assignment.starts_at,
    nullif(left(btrim(coalesce(p_local_display_time, '')), 200), ''), p_category, btrim(p_message), v_submitted_at,
    jsonb_build_object('other_room', other_room)
  )
  returning id into request_id;

  return jsonb_build_object(
    'request_id', request_id,
    'player_id', me,
    'player_screen_name', assignment.player_screen_name_snapshot,
    'event_name', assignment.event_name,
    'round_number', assignment.day_number,
    'room_label', assignment.group_label,
    'scheduled_start', assignment.starts_at,
    'local_display_time', nullif(left(btrim(coalesce(p_local_display_time, '')), 200), ''),
    'category', p_category,
    'message', btrim(p_message),
    'submitted_at', v_submitted_at,
    'other_room', other_room
  );
end
$function$;

revoke all on function public.create_my_masters_admin_help_request(uuid, uuid, text, text, text)
from public, anon, authenticated;
grant execute on function public.create_my_masters_admin_help_request(uuid, uuid, text, text, text)
to authenticated;

create or replace function public.get_masters_admin_dm_recipients()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  expected record;
  candidate_ids uuid[];
  discord_ids text[];
  canonical_player_id uuid;
  discord_user_id text;
  canonical_screen_name text;
  recipients jsonb := '[]'::jsonb;
begin
  for expected in
    select *
    from (values
      ('Krys'::text, 'princessbankshot'::text, false),
      ('Tricky'::text, 'trickydicky'::text, false),
      ('Dawn'::text, 'spicy'::text, true),
      ('Lynn'::text, 'lynniebodd'::text, false)
    ) configured(label, lookup_name, token_match)
  loop
    select array_agg(distinct matched.canonical_player_id order by matched.canonical_player_id)
    into candidate_ids
    from (
      select public.resolve_canonical_player_id(player.id) as canonical_player_id
      from public.players player
      where case when expected.token_match then
        (' ' || regexp_replace(lower(coalesce(player.screen_name, '') || ' ' || coalesce(player.discord_name, '') || ' ' || coalesce(player.discord_username, '')), '[^a-z0-9]+', ' ', 'g') || ' ')
          like ('% ' || expected.lookup_name || ' %')
      else
        regexp_replace(lower(coalesce(player.screen_name, '')), '[^a-z0-9]', '', 'g') = expected.lookup_name
        or regexp_replace(lower(coalesce(player.discord_name, '')), '[^a-z0-9]', '', 'g') = expected.lookup_name
        or regexp_replace(lower(coalesce(player.discord_username, '')), '[^a-z0-9]', '', 'g') = expected.lookup_name
      end

      union all

      select public.resolve_canonical_player_id(member.player_id)
      from public.discord_members member
      where case when expected.token_match then
        (' ' || regexp_replace(lower(coalesce(member.walkabout_name, '') || ' ' || coalesce(member.discord_name, '')), '[^a-z0-9]+', ' ', 'g') || ' ')
          like ('% ' || expected.lookup_name || ' %')
      else
        regexp_replace(lower(coalesce(member.walkabout_name, '')), '[^a-z0-9]', '', 'g') = expected.lookup_name
        or regexp_replace(lower(coalesce(member.discord_name, '')), '[^a-z0-9]', '', 'g') = expected.lookup_name
      end
    ) matched
    where matched.canonical_player_id is not null;

    if coalesce(cardinality(candidate_ids), 0) <> 1 then
      raise exception 'Masters admin identity % is missing or ambiguous.', expected.label using errcode = '21000';
    end if;
    canonical_player_id := candidate_ids[1];

    select player.screen_name into canonical_screen_name
    from public.players player
    where player.id = canonical_player_id;

    select array_agg(distinct linked.discord_id order by linked.discord_id)
    into discord_ids
    from (
      select nullif(btrim(player.discord_id), '') as discord_id
      from public.players player
      where public.resolve_canonical_player_id(player.id) = canonical_player_id
      union all
      select nullif(btrim(member.discord_id), '')
      from public.discord_members member
      where public.resolve_canonical_player_id(member.player_id) = canonical_player_id
    ) linked
    where linked.discord_id is not null;

    if coalesce(cardinality(discord_ids), 0) <> 1 then
      raise exception 'Masters admin Discord identity % is missing or ambiguous.', expected.label using errcode = '21000';
    end if;
    discord_user_id := discord_ids[1];

    if not exists (
      select 1
      from public.site_admin_users site_admin
      join auth.identities identity on identity.user_id = site_admin.user_id
      where identity.provider = 'discord'
        and coalesce(
          identity.identity_data->>'provider_id',
          identity.identity_data->>'sub',
          identity.provider_id
        ) = discord_user_id
    ) then
      raise exception 'Masters admin identity % is not authorized.', expected.label using errcode = '42501';
    end if;

    recipients := recipients || jsonb_build_array(jsonb_build_object(
      'label', expected.label,
      'lookup_name', expected.lookup_name,
      'canonical_player_id', canonical_player_id,
      'canonical_screen_name', canonical_screen_name,
      'discord_user_id', discord_user_id
    ));
  end loop;

  return recipients;
end
$function$;

revoke all on function public.get_masters_admin_dm_recipients()
from public, anon, authenticated;
grant execute on function public.get_masters_admin_dm_recipients()
to service_role;

create or replace function public.get_major_verification_discord_context(p_scorecard_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  context record;
begin
  select
    card.player_id,
    card.major_event_id,
    card.play_day_id,
    room.id as schedule_group_id,
    day.day_number as round_number,
    room.group_label as room_label
  into context
  from public.major_player_scorecards card
  join public.major_play_days day on day.id = card.play_day_id
  join public.major_schedule_group_members member
    on member.entry_id = card.entry_id
   and member.play_day_id = card.play_day_id
  join public.major_schedule_groups room
    on room.id = member.group_id
   and room.major_event_id = card.major_event_id
   and room.play_day_id = card.play_day_id
  where card.id = p_scorecard_id
    and room.is_published
    and (select count(*) from public.major_schedule_group_members counted where counted.group_id = room.id) between 2 and 4
  limit 1;

  if not found then
    raise exception 'A complete published Masters room is required.' using errcode = '42501';
  end if;
  if not public.is_current_user_site_admin()
     and context.player_id is distinct from public.current_major_player_id() then
    raise exception 'This scorecard does not belong to the current player.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'major_event_id', context.major_event_id,
    'play_day_id', context.play_day_id,
    'schedule_group_id', context.schedule_group_id,
    'round_number', context.round_number,
    'room_label', context.room_label
  );
end
$function$;

revoke all on function public.get_major_verification_discord_context(uuid)
from public, anon, authenticated;
grant execute on function public.get_major_verification_discord_context(uuid)
to authenticated;

create or replace function public.get_major_verification_discord_room_state(
  p_major_event_id uuid,
  p_play_day_id uuid,
  p_schedule_group_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
select jsonb_build_object(
  'major_event_id', room.major_event_id,
  'play_day_id', room.play_day_id,
  'schedule_group_id', room.id,
  'round_number', day.day_number,
  'room_label', room.group_label,
  'room_scorecard_uploaded', exists (
    select 1
    from public.major_room_scorecard_proofs proof
    where proof.schedule_group_id = room.id
      and proof.replaced_at is null
  ),
  'roster_size', count(member.entry_id),
  'submitted_count', count(card.id) filter (where card.status = 'submitted'),
  'correction_count', count(card.id) filter (where card.status = 'reopened'),
  'verified_count', count(card.id) filter (where card.status = 'verified'),
  'action_required_count', count(card.id) filter (where card.status in ('submitted', 'reopened'))
)
from public.major_schedule_groups room
join public.major_play_days day on day.id = room.play_day_id
join public.major_schedule_group_members member on member.group_id = room.id
left join public.major_player_scorecards card
  on card.entry_id = member.entry_id
 and card.play_day_id = room.play_day_id
where room.id = p_schedule_group_id
  and room.major_event_id = p_major_event_id
  and room.play_day_id = p_play_day_id
  and room.is_published
group by room.id, room.major_event_id, room.play_day_id, room.group_label, day.day_number
having count(member.entry_id) between 2 and 4
$function$;

revoke all on function public.get_major_verification_discord_room_state(uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.get_major_verification_discord_room_state(uuid, uuid, uuid)
to service_role;

create or replace function public.claim_major_verification_discord_alert(
  p_major_event_id uuid,
  p_play_day_id uuid,
  p_schedule_group_id uuid,
  p_discord_channel_id text,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  token uuid := gen_random_uuid();
  claimed public.major_score_verification_discord_alerts%rowtype;
begin
  if p_discord_channel_id <> '1555012516625653840'
     or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid Masters verification alert destination or payload.' using errcode = '22023';
  end if;

  insert into public.major_score_verification_discord_alerts (
    major_event_id, play_day_id, schedule_group_id, discord_channel_id
  ) values (
    p_major_event_id, p_play_day_id, p_schedule_group_id, p_discord_channel_id
  )
  on conflict (major_event_id, play_day_id, schedule_group_id) do nothing;

  update public.major_score_verification_discord_alerts alert
  set sync_token = token,
      sync_lease_until = now() + interval '30 seconds',
      desired_payload_hash = p_payload_hash,
      updated_at = now()
  where alert.major_event_id = p_major_event_id
    and alert.play_day_id = p_play_day_id
    and alert.schedule_group_id = p_schedule_group_id
    and alert.discord_channel_id = p_discord_channel_id
    and (alert.sync_lease_until is null or alert.sync_lease_until <= now())
  returning alert.* into claimed;

  if not found then
    return jsonb_build_object('claimed', false);
  end if;

  return jsonb_build_object(
    'claimed', true,
    'alert_id', claimed.id,
    'sync_token', token,
    'discord_message_id', claimed.discord_message_id,
    'last_payload_hash', claimed.last_payload_hash
  );
end
$function$;

revoke all on function public.claim_major_verification_discord_alert(uuid, uuid, uuid, text, text)
from public, anon, authenticated;
grant execute on function public.claim_major_verification_discord_alert(uuid, uuid, uuid, text, text)
to service_role;

create or replace function public.finalize_major_verification_discord_alert(
  p_alert_id uuid,
  p_sync_token uuid,
  p_status text,
  p_discord_message_id text,
  p_payload_hash text,
  p_error text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if p_status not in ('active', 'resolved', 'failed') then
    raise exception 'Invalid Masters verification alert state.' using errcode = '22023';
  end if;

  update public.major_score_verification_discord_alerts alert
  set status = p_status,
      discord_message_id = case when p_status = 'resolved' then null else p_discord_message_id end,
      last_discord_message_id = case
        when p_status = 'resolved' then coalesce(p_discord_message_id, alert.discord_message_id, alert.last_discord_message_id)
        else alert.last_discord_message_id
      end,
      last_payload_hash = case when p_status = 'failed' then alert.last_payload_hash else p_payload_hash end,
      last_synced_at = case when p_status = 'failed' then alert.last_synced_at else now() end,
      resolved_at = case when p_status = 'resolved' then now() else null end,
      last_error = nullif(left(coalesce(p_error, ''), 500), ''),
      sync_token = null,
      sync_lease_until = null,
      updated_at = now()
  where alert.id = p_alert_id
    and alert.sync_token = p_sync_token;

  if not found then
    raise exception 'Masters verification alert lease expired.' using errcode = '40001';
  end if;
end
$function$;

revoke all on function public.finalize_major_verification_discord_alert(uuid, uuid, text, text, text, text)
from public, anon, authenticated;
grant execute on function public.finalize_major_verification_discord_alert(uuid, uuid, text, text, text, text)
to service_role;

commit;
