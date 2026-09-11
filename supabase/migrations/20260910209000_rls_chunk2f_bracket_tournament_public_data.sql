-- Staging-only security chunk 2F: bracket/tournament database tables.
-- The live public bracket uses Tourney Bot directly; these tables are not
-- public-reader dependencies. Keep bracket result writes site-admin-only.

begin;

alter table public.bracket_results enable row level security;
alter table public.bracket_public_content enable row level security;

revoke all on table public.bracket_results from public, anon, authenticated;
revoke all on table public.bracket_public_content from public, anon, authenticated;

grant all on table public.bracket_results to service_role;
grant all on table public.bracket_public_content to service_role;

grant insert on table public.bracket_results to authenticated;

drop policy if exists chunk2f_site_admin_insert_bracket_results on public.bracket_results;

create policy chunk2f_site_admin_insert_bracket_results
  on public.bracket_results
  for insert
  to authenticated
  with check ((select public.is_current_user_site_admin()));

commit;
