begin;

-- These five errors are expected optimistic-lock or lease conflicts. They are
-- not PostgreSQL serialization failures, so they must not use retryable 40001.

create or replace function public.update_masters_stream_scorecard(
  p_session_id uuid,
  p_expected_revision bigint,
  p_current_hole integer,
  p_scores jsonb,
  p_trigger_fireworks boolean default false
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  session_record public.major_scoring_sessions%rowtype;
  score_item jsonb;
  score_participant_id uuid;
  score_hole_number integer;
  score_value integer;
  next_revision bigint;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  if p_current_hole not between 1 and 18 then raise exception 'Hole must be between 1 and 18'; end if;
  if jsonb_typeof(p_scores) <> 'array' then raise exception 'Scores must be an array'; end if;

  select * into session_record
  from public.major_scoring_sessions
  where id = p_session_id
  for update;
  if not found then raise exception 'Broadcast scorecard not found'; end if;
  if session_record.schedule_group_id is null then
    raise exception 'This is not a room-driven Masters stream scorecard' using errcode = '22023';
  end if;
  if not session_record.is_active or not session_record.is_public then
    raise exception 'This stream scorecard is no longer active; reload the current room' using errcode = '55000';
  end if;
  if session_record.revision <> p_expected_revision then
    raise exception 'STALE_STREAM_REVISION' using errcode = 'PT409';
  end if;

  for score_item in select value from jsonb_array_elements(p_scores)
  loop
    score_participant_id := (score_item ->> 'participant_id')::uuid;
    score_hole_number := coalesce((score_item ->> 'hole_number')::integer, p_current_hole);
    if score_hole_number not between 1 and 18 then raise exception 'Score hole must be between 1 and 18'; end if;
    if not exists (
      select 1
      from public.major_scoring_participants participant
      where participant.id = score_participant_id
        and participant.session_id = p_session_id
    ) then
      raise exception 'Participant does not belong to this broadcast scorecard';
    end if;

    if score_item ->> 'strokes' is null then
      delete from public.major_hole_scores
      where session_id = p_session_id
        and participant_id = score_participant_id
        and hole_number = score_hole_number;
    else
      score_value := (score_item ->> 'strokes')::integer;
      if score_value not between 1 and 99 then raise exception 'Score must be between 1 and 99'; end if;
      insert into public.major_hole_scores (session_id, participant_id, hole_number, strokes)
      values (p_session_id, score_participant_id, score_hole_number, score_value)
      on conflict (session_id, participant_id, hole_number)
      do update set strokes = excluded.strokes, updated_at = now();
    end if;
  end loop;

  update public.major_scoring_sessions
  set current_hole = p_current_hole,
      revision = revision + 1,
      fireworks_sequence = fireworks_sequence + case when p_trigger_fireworks then 1 else 0 end,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_session_id
  returning revision into next_revision;
  return next_revision;
end;
$function$;

create or replace function public.reorder_masters_stream_participants(
  p_session_id uuid,
  p_expected_revision bigint,
  p_participant_ids uuid[]
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  session_record public.major_scoring_sessions%rowtype;
  distinct_count integer;
  next_revision bigint;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;

  select * into session_record
  from public.major_scoring_sessions
  where id = p_session_id
  for update;
  if not found then raise exception 'Broadcast scorecard not found'; end if;
  if session_record.schedule_group_id is null then
    raise exception 'This is not a room-driven Masters stream scorecard' using errcode = '22023';
  end if;
  if not session_record.is_active or not session_record.is_public then
    raise exception 'This stream scorecard is no longer active; reload the current room' using errcode = '55000';
  end if;
  if session_record.revision <> p_expected_revision then
    raise exception 'STALE_STREAM_REVISION' using errcode = 'PT409';
  end if;
  if pg_catalog.cardinality(p_participant_ids) <> session_record.participant_count then
    raise exception 'Player order must contain the complete broadcast roster' using errcode = '22023';
  end if;

  select count(distinct ordered.participant_id)
  into distinct_count
  from pg_catalog.unnest(p_participant_ids) as ordered(participant_id);
  if distinct_count <> session_record.participant_count
    or exists (
      select 1
      from pg_catalog.unnest(p_participant_ids) as ordered(participant_id)
      where not exists (
        select 1
        from public.major_scoring_participants participant
        where participant.session_id = p_session_id
          and participant.id = ordered.participant_id
      )
    ) then
    raise exception 'Player order must contain each broadcast participant exactly once' using errcode = '22023';
  end if;

  update public.major_scoring_sessions
  set stream_participant_order = p_participant_ids,
      revision = revision + 1,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_session_id
  returning revision into next_revision;
  return next_revision;
end;
$function$;

create or replace function public.update_masters_simple_stream_total(
  p_session_id uuid,
  p_expected_revision bigint,
  p_participant_id uuid,
  p_total_to_par integer
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  session_record public.major_scoring_sessions%rowtype;
  next_revision bigint;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  if p_total_to_par not between -999 and 999 then
    raise exception 'Broadcast total must be between -999 and 999' using errcode = '22023';
  end if;

  select * into session_record
  from public.major_scoring_sessions
  where id = p_session_id
  for update;
  if not found then raise exception 'Broadcast scorecard not found'; end if;
  if session_record.schedule_group_id is null then
    raise exception 'This is not a room-driven Masters stream scorecard' using errcode = '22023';
  end if;
  if not session_record.is_active or not session_record.is_public then
    raise exception 'This stream scorecard is no longer active; reload the current room' using errcode = '55000';
  end if;
  if session_record.revision <> p_expected_revision then
    raise exception 'STALE_STREAM_REVISION' using errcode = 'PT409';
  end if;
  if not exists (
    select 1 from public.major_scoring_participants participant
    where participant.session_id = p_session_id and participant.id = p_participant_id
  ) then
    raise exception 'Participant does not belong to this broadcast scorecard' using errcode = '22023';
  end if;

  update public.major_scoring_sessions
  set stream_total_scores = pg_catalog.jsonb_set(
        stream_total_scores,
        array[p_participant_id::text],
        pg_catalog.to_jsonb(p_total_to_par),
        true
      ),
      revision = revision + 1,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_session_id
  returning revision into next_revision;
  return next_revision;
end;
$function$;

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
    raise exception 'The room scorecard photo changed. Refresh before replacing it.' using errcode = 'PT409';
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
    raise exception 'Masters verification alert lease expired.' using errcode = 'PT409';
  end if;
end
$function$;

revoke all on function public.update_masters_stream_scorecard(uuid, bigint, integer, jsonb, boolean)
from public, anon, authenticated;
grant execute on function public.update_masters_stream_scorecard(uuid, bigint, integer, jsonb, boolean)
to authenticated, service_role;

revoke all on function public.reorder_masters_stream_participants(uuid, bigint, uuid[])
from public, anon, authenticated;
grant execute on function public.reorder_masters_stream_participants(uuid, bigint, uuid[])
to authenticated, service_role;

revoke all on function public.update_masters_simple_stream_total(uuid, bigint, uuid, integer)
from public, anon, authenticated;
grant execute on function public.update_masters_simple_stream_total(uuid, bigint, uuid, integer)
to authenticated, service_role;

revoke all on function public.record_major_room_scorecard_proof_service(
  uuid, uuid, uuid, text, text, text, text, integer, text, boolean, uuid
) from public, anon, authenticated;
grant execute on function public.record_major_room_scorecard_proof_service(
  uuid, uuid, uuid, text, text, text, text, integer, text, boolean, uuid
) to service_role;

revoke all on function public.finalize_major_verification_discord_alert(uuid, uuid, text, text, text, text)
from public, anon, authenticated;
grant execute on function public.finalize_major_verification_discord_alert(uuid, uuid, text, text, text, text)
to service_role;

commit;
