-- Repair recursive room/member reads without changing any Studio or MGA rows.
-- The SECURITY DEFINER helper applies the existing admin, publication, event,
-- round, room-source, and canonical-player checks while bypassing table RLS.

drop policy if exists scoring_studio_rooms_read on public.scoring_studio_rooms;
create policy scoring_studio_rooms_read
  on public.scoring_studio_rooms
  for select
  to authenticated
  using (
    public.scoring_studio_room_access_v1(
      instance_id,
      round_id,
      'studio',
      id,
      null
    )
  );

drop policy if exists scoring_studio_room_members_read on public.scoring_studio_room_members;
create policy scoring_studio_room_members_read
  on public.scoring_studio_room_members
  for select
  to authenticated
  using (
    public.scoring_studio_room_access_v1(
      instance_id,
      round_id,
      'studio',
      room_id,
      canonical_player_id
    )
  );

-- This SECURITY DEFINER function resolves only auth.uid() to that user's
-- canonical Global Player ID. It grants no ability to query other identities.
grant execute on function public.current_major_player_id() to authenticated;
