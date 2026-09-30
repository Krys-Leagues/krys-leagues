begin;

-- The existing shared-scorecard-evidence bucket is private and is already used
-- through protected server routes. Reaffirm its private limits without creating
-- a second evidence store.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'shared-scorecard-evidence',
  'shared-scorecard-evidence',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.major_room_scorecard_proofs (
  id uuid primary key,
  major_event_id uuid not null references public.major_events(id) on delete restrict,
  play_day_id uuid not null references public.major_play_days(id) on delete restrict,
  schedule_group_id uuid not null references public.major_schedule_groups(id) on delete restrict,
  revision integer not null check (revision > 0),
  storage_bucket text not null default 'shared-scorecard-evidence'
    check (storage_bucket = 'shared-scorecard-evidence'),
  storage_path text not null unique,
  original_file_name text not null check (length(original_file_name) between 1 and 255),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  byte_size integer not null check (byte_size between 1 and 10485760),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by_player_id uuid not null references public.players(id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  replaces_proof_id uuid references public.major_room_scorecard_proofs(id) on delete restrict,
  replaced_at timestamptz,
  replaced_by_player_id uuid references public.players(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (schedule_group_id, revision),
  check ((replaced_at is null and replaced_by_player_id is null)
      or (replaced_at is not null and replaced_by_player_id is not null))
);

create unique index if not exists major_room_scorecard_proofs_one_current_idx
  on public.major_room_scorecard_proofs(schedule_group_id)
  where replaced_at is null;

create index if not exists major_room_scorecard_proofs_event_day_idx
  on public.major_room_scorecard_proofs(major_event_id, play_day_id, uploaded_at desc);

create index if not exists major_room_scorecard_proofs_play_day_idx
  on public.major_room_scorecard_proofs(play_day_id);

create index if not exists major_room_scorecard_proofs_uploader_idx
  on public.major_room_scorecard_proofs(uploaded_by_player_id);

create index if not exists major_room_scorecard_proofs_replacer_idx
  on public.major_room_scorecard_proofs(replaced_by_player_id)
  where replaced_by_player_id is not null;

create index if not exists major_room_scorecard_proofs_replaces_idx
  on public.major_room_scorecard_proofs(replaces_proof_id)
  where replaces_proof_id is not null;

alter table public.major_room_scorecard_proofs enable row level security;
alter table public.major_room_scorecard_proofs force row level security;
revoke all on table public.major_room_scorecard_proofs from public, anon, authenticated;
grant select, insert, update on table public.major_room_scorecard_proofs to service_role;

-- Instruction-only republishing has a separate narrow mutation path. It never
-- touches roster rows, selected times, room identity, or publication state.
create or replace function public.republish_major_schedule_group_instructions(
  p_group_id uuid,
  p_instructions text
)
returns public.major_schedule_groups
language plpgsql
security definer
set search_path to ''
as $function$
declare
  saved public.major_schedule_groups%rowtype;
  member_count integer;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required.' using errcode = '42501';
  end if;

  select *
  into saved
  from public.major_schedule_groups
  where id = p_group_id
  for update;

  if not found then
    raise exception 'Masters room was not found.';
  end if;
  if not saved.is_published then
    raise exception 'Only an already-published Masters room can use instruction-only republish.';
  end if;

  select count(*)::integer
  into member_count
  from public.major_schedule_group_members
  where group_id = p_group_id;

  if member_count not between 2 and 4 then
    raise exception 'Only a complete two- to four-player Masters room can be republished.' using errcode = '22023';
  end if;

  update public.major_schedule_groups
  set instructions = nullif(btrim(p_instructions), ''),
      updated_at = now()
  where id = p_group_id
  returning * into saved;

  return saved;
end
$function$;

revoke all on function public.republish_major_schedule_group_instructions(uuid, text)
from public, anon, authenticated;
grant execute on function public.republish_major_schedule_group_instructions(uuid, text)
to authenticated;

-- Authenticated players receive a room context only when they are assigned to
-- that exact complete, published room and the round is player-visible.
create or replace function public.get_my_major_room_scorecard_context(
  p_play_day_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  me uuid;
  result jsonb;
begin
  me := public.current_major_player_id();
  if me is null then
    return null;
  end if;

  select jsonb_build_object(
    'group_id', room.id,
    'major_event_id', room.major_event_id,
    'play_day_id', room.play_day_id,
    'group_label', room.group_label,
    'instructions', room.instructions,
    'player_id', me,
    'day_number', day.day_number,
    'day_label', day.label,
    'roster', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'player_id', roster_entry.player_id,
          'player_screen_name_snapshot', roster_entry.player_screen_name_snapshot
        )
        order by roster_entry.player_screen_name_snapshot, roster_entry.player_id
      )
      from public.major_schedule_group_members roster_member
      join public.major_entries roster_entry on roster_entry.id = roster_member.entry_id
      where roster_member.group_id = room.id
    ), '[]'::jsonb)
  )
  into result
  from public.major_entries entry
  join public.major_entry_day_choices choice
    on choice.entry_id = entry.id
   and choice.play_day_id = p_play_day_id
  join public.major_play_days day on day.id = choice.play_day_id
  join public.major_events event on event.id = day.major_event_id
  join public.major_schedule_group_members membership
    on membership.entry_id = entry.id
   and membership.play_day_id = day.id
   and membership.time_slot_id = choice.time_slot_id
  join public.major_schedule_groups room
    on room.id = membership.group_id
   and room.major_event_id = event.id
   and room.play_day_id = day.id
   and room.time_slot_id = choice.time_slot_id
   and room.is_published
  where entry.player_id = me
    and entry.status in ('registered', 'confirmed')
    and (day.day_number <= 2 or event.weekend_status_published_at is not null)
    and (select count(*) from public.major_schedule_group_members count_member where count_member.group_id = room.id) between 2 and 4
  limit 1;

  return result;
end
$function$;

revoke all on function public.get_my_major_room_scorecard_context(uuid)
from public, anon, authenticated;
grant execute on function public.get_my_major_room_scorecard_context(uuid)
to authenticated;

-- The protected server uploads the immutable object first, then calls this
-- transaction-safe writer. A replacement must name the proof the player saw,
-- preventing a concurrent upload from being silently overwritten.
create or replace function public.record_major_room_scorecard_proof_service(
  p_id uuid,
  p_schedule_group_id uuid,
  p_uploader_player_id uuid,
  p_storage_bucket text,
  p_storage_path text,
  p_original_file_name text,
  p_content_type text,
  p_byte_size integer,
  p_sha256 text,
  p_replace boolean,
  p_expected_proof_id uuid default null
)
returns public.major_room_scorecard_proofs
language plpgsql
security definer
set search_path to ''
as $function$
declare
  room public.major_schedule_groups%rowtype;
  current_proof public.major_room_scorecard_proofs%rowtype;
  saved public.major_room_scorecard_proofs%rowtype;
  member_count integer;
  next_revision integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Protected server authorization is required.' using errcode = '42501';
  end if;
  if p_storage_bucket <> 'shared-scorecard-evidence' then
    raise exception 'Invalid Masters room scorecard storage bucket.' using errcode = '22023';
  end if;

  select * into room
  from public.major_schedule_groups
  where id = p_schedule_group_id
  for update;

  if not found or not room.is_published then
    raise exception 'A complete published Masters room is required.' using errcode = '42501';
  end if;

  select count(*)::integer into member_count
  from public.major_schedule_group_members
  where group_id = room.id;

  if member_count not between 2 and 4 then
    raise exception 'A complete two- to four-player Masters room is required.' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.major_schedule_group_members member
    join public.major_entries entry on entry.id = member.entry_id
    where member.group_id = room.id
      and entry.player_id = p_uploader_player_id
      and entry.status in ('registered', 'confirmed')
  ) then
    raise exception 'The uploader is not assigned to this Masters room.' using errcode = '42501';
  end if;

  select * into current_proof
  from public.major_room_scorecard_proofs
  where schedule_group_id = room.id
    and replaced_at is null
  for update;

  if current_proof.id is not null and not coalesce(p_replace, false) then
    raise exception 'A room scorecard photo already exists. Use the explicit replace action.' using errcode = '23505';
  end if;
  if current_proof.id is null and coalesce(p_replace, false) then
    raise exception 'There is no current room scorecard photo to replace.' using errcode = '22023';
  end if;
  if current_proof.id is not null and p_expected_proof_id is distinct from current_proof.id then
    raise exception 'The room scorecard photo changed. Refresh before replacing it.' using errcode = '40001';
  end if;

  next_revision := coalesce(current_proof.revision, 0) + 1;
  if current_proof.id is not null then
    update public.major_room_scorecard_proofs
    set replaced_at = now(),
        replaced_by_player_id = p_uploader_player_id
    where id = current_proof.id;
  end if;

  insert into public.major_room_scorecard_proofs (
    id,
    major_event_id,
    play_day_id,
    schedule_group_id,
    revision,
    storage_bucket,
    storage_path,
    original_file_name,
    content_type,
    byte_size,
    sha256,
    uploaded_by_player_id,
    replaces_proof_id
  ) values (
    p_id,
    room.major_event_id,
    room.play_day_id,
    room.id,
    next_revision,
    p_storage_bucket,
    p_storage_path,
    left(p_original_file_name, 255),
    p_content_type,
    p_byte_size,
    lower(p_sha256),
    p_uploader_player_id,
    current_proof.id
  )
  returning * into saved;

  return saved;
end
$function$;

revoke all on function public.record_major_room_scorecard_proof_service(
  uuid, uuid, uuid, text, text, text, text, integer, text, boolean, uuid
) from public, anon, authenticated;
grant execute on function public.record_major_room_scorecard_proof_service(
  uuid, uuid, uuid, text, text, text, text, integer, text, boolean, uuid
) to service_role;

-- Preserve individual-player verification while adding room context. Storage
-- paths remain server-only; the admin API streams authorized private images.
create or replace function public.get_major_scorecard_verification_queue(p_major_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
select case when public.is_current_user_site_admin() then coalesce(jsonb_agg(jsonb_build_object(
  'id', card.id,
  'major_event_id', card.major_event_id,
  'play_day_id', card.play_day_id,
  'entry_id', card.entry_id,
  'player_id', card.player_id,
  'player_screen_name_snapshot', card.player_screen_name_snapshot,
  'course_code', card.course_code,
  'status', card.status,
  'submitted_at', card.submitted_at,
  'submitted_by', card.submitted_by,
  'verified_at', card.verified_at,
  'verified_by', card.verified_by,
  'verification_notes', card.verification_notes,
  'day_number', day.day_number,
  'day_label', day.label,
  'slot_starts_at', slot.starts_at,
  'room_group_id', room.id,
  'room_label', room.group_label,
  'room_instructions', room.instructions,
  'room_roster', case when room.id is null then '[]'::jsonb else coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'player_id', roster_entry.player_id,
        'player_screen_name_snapshot', roster_entry.player_screen_name_snapshot
      )
      order by roster_entry.player_screen_name_snapshot, roster_entry.player_id
    )
    from public.major_schedule_group_members roster_member
    join public.major_entries roster_entry on roster_entry.id = roster_member.entry_id
    where roster_member.group_id = room.id
  ), '[]'::jsonb) end,
  'total_strokes', (select sum(hole.strokes) from public.major_player_scorecard_holes hole where hole.scorecard_id = card.id),
  'score_to_par', (select sum(hole.strokes - hole.par) from public.major_player_scorecard_holes hole where hole.scorecard_id = card.id),
  'holes', (select jsonb_agg(jsonb_build_object('hole_number', hole.hole_number, 'par', hole.par, 'strokes', hole.strokes) order by hole.hole_number) from public.major_player_scorecard_holes hole where hole.scorecard_id = card.id)
) order by card.submitted_at desc), '[]'::jsonb) else '[]'::jsonb end
from public.major_player_scorecards card
join public.major_play_days day on day.id = card.play_day_id
left join public.major_entry_day_choices choice on choice.entry_id = card.entry_id and choice.play_day_id = card.play_day_id
left join public.major_time_slots slot on slot.id = choice.time_slot_id
left join public.major_schedule_group_members membership on membership.entry_id = card.entry_id and membership.play_day_id = card.play_day_id
left join public.major_schedule_groups room on room.id = membership.group_id
where card.major_event_id = p_major_event_id
$function$;

revoke all on function public.get_major_scorecard_verification_queue(uuid)
from public, anon, authenticated;
grant execute on function public.get_major_scorecard_verification_queue(uuid)
to authenticated;

commit;
