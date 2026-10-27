begin;

-- RLS does not apply to TRUNCATE. Browser roles never need to erase whole
-- application tables, including protected league history and audit tables.
revoke truncate on all tables in schema public from anon, authenticated;

-- The current application does not mutate these legacy fixture rows, but keep
-- an explicitly authorized admin path for any remaining operational cleanup.
drop policy if exists "Allow public insert fixtures" on public.fixtures;
drop policy if exists "Allow public update fixtures" on public.fixtures;

create policy "Site admins insert legacy fixtures"
on public.fixtures for insert
to authenticated
with check ((select public.is_current_user_site_admin()));

create policy "Site admins update legacy fixtures"
on public.fixtures for update
to authenticated
using ((select public.is_current_user_site_admin()))
with check ((select public.is_current_user_site_admin()));

create policy "Site admins delete legacy fixtures"
on public.fixtures for delete
to authenticated
using ((select public.is_current_user_site_admin()));

revoke insert, update, delete on table public.fixtures from anon;
grant insert, update, delete on table public.fixtures to authenticated;

-- player_leagues is an empty legacy relation. Preserve its existing public
-- read compatibility, but no anonymous caller may create or rewrite identity
-- membership rows.
drop policy if exists "allow insert player leagues" on public.player_leagues;
drop policy if exists "allow update player leagues" on public.player_leagues;
drop policy if exists "allow delete player leagues" on public.player_leagues;

create policy "Site admins insert legacy player leagues"
on public.player_leagues for insert
to authenticated
with check ((select public.is_current_user_site_admin()));

create policy "Site admins update legacy player leagues"
on public.player_leagues for update
to authenticated
using ((select public.is_current_user_site_admin()))
with check ((select public.is_current_user_site_admin()));

create policy "Site admins delete legacy player leagues"
on public.player_leagues for delete
to authenticated
using ((select public.is_current_user_site_admin()));

revoke insert, update, delete on table public.player_leagues from anon;
grant insert, update, delete on table public.player_leagues to authenticated;

-- admin_users predates the canonical site_admin_users authorization model and
-- contains Discord identifiers. Keep it available only to canonical admins.
drop policy if exists "allow admin read" on public.admin_users;

create policy "Site admins read legacy admin users"
on public.admin_users for select
to authenticated
using ((select public.is_current_user_site_admin()));

revoke all privileges on table public.admin_users from anon;
revoke insert, update, delete, references, trigger on table public.admin_users from authenticated;
grant select on table public.admin_users to authenticated;

commit;
