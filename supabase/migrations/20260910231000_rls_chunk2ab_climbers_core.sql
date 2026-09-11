-- Chunk 2AB: protect Climbers core state behind the admin server path.
-- The admin page reads these tables through /api/admin/records/climbers,
-- which authorizes the caller and then uses the server service_role client.

begin;

alter table public.climbers_seasons enable row level security;
alter table public.climbers_events enable row level security;
alter table public.climbers_event_passes enable row level security;

revoke all on table public.climbers_seasons from public, anon, authenticated;
revoke all on table public.climbers_events from public, anon, authenticated;
revoke all on table public.climbers_event_passes from public, anon, authenticated;

grant all on table public.climbers_seasons to service_role;
grant all on table public.climbers_events to service_role;
grant all on table public.climbers_event_passes to service_role;

commit;
