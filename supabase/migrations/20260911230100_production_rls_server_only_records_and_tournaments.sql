-- Production RLS batch: tables referenced only by protected server routes.
-- Public records are served by service-role API code; tournament entries are
-- served and mutated by the protected admin players API.

alter table public.combined_course_records enable row level security;
alter table public.player_tournament_entries enable row level security;

revoke all on table public.combined_course_records, public.player_tournament_entries
from public, anon, authenticated;

grant select on table public.combined_course_records to anon, authenticated;
grant all on table public.combined_course_records, public.player_tournament_entries
to service_role;

drop policy if exists production_public_read_combined_course_records on public.combined_course_records;
create policy production_public_read_combined_course_records
  on public.combined_course_records for select to anon, authenticated
  using (true);
