begin;

-- These legacy admin screens still use the authenticated browser client. Keep
-- their existing reads, but make every write depend on the canonical site-admin
-- authorization function. RLS does not protect TRUNCATE, so remove that grant.

revoke insert, update, delete, truncate on table public.seasons from anon;
revoke truncate on table public.seasons from authenticated;

drop policy if exists "Allow authenticated insert seasons" on public.seasons;
drop policy if exists "Allow authenticated update seasons" on public.seasons;
drop policy if exists "Allow authenticated delete seasons" on public.seasons;

create policy "Site admins insert seasons"
on public.seasons for insert
to authenticated
with check ((select public.is_current_user_site_admin()));

create policy "Site admins update seasons"
on public.seasons for update
to authenticated
using ((select public.is_current_user_site_admin()))
with check ((select public.is_current_user_site_admin()));

create policy "Site admins delete seasons"
on public.seasons for delete
to authenticated
using ((select public.is_current_user_site_admin()));

grant select, insert, update, delete on table public.seasons to authenticated;

revoke all privileges on table public.schedule from anon;
revoke truncate, references, trigger on table public.schedule from authenticated;

drop policy if exists "Site admins insert managed schedule" on public.schedule;
drop policy if exists "Site admins update managed schedule" on public.schedule;
drop policy if exists "Site admins delete managed schedule" on public.schedule;

create policy "Site admins insert managed schedule"
on public.schedule for insert
to authenticated
with check ((select public.is_current_user_site_admin()));

create policy "Site admins update managed schedule"
on public.schedule for update
to authenticated
using ((select public.is_current_user_site_admin()))
with check ((select public.is_current_user_site_admin()));

create policy "Site admins delete managed schedule"
on public.schedule for delete
to authenticated
using ((select public.is_current_user_site_admin()));

grant select, insert, update, delete on table public.schedule to authenticated;

revoke all privileges on table public.results from anon;
revoke truncate, references, trigger on table public.results from authenticated;

drop policy if exists "Site admins insert managed results" on public.results;
drop policy if exists "Site admins update managed results" on public.results;
drop policy if exists "Site admins delete managed results" on public.results;

create policy "Site admins insert managed results"
on public.results for insert
to authenticated
with check ((select public.is_current_user_site_admin()));

create policy "Site admins update managed results"
on public.results for update
to authenticated
using ((select public.is_current_user_site_admin()))
with check ((select public.is_current_user_site_admin()));

create policy "Site admins delete managed results"
on public.results for delete
to authenticated
using ((select public.is_current_user_site_admin()));

grant select, insert, update, delete on table public.results to authenticated;

create sequence if not exists public.doubles_teams_id_seq;
select pg_catalog.setval(
  'public.doubles_teams_id_seq',
  greatest(coalesce((select max(team.id) from public.doubles_teams as team), 0), 1),
  exists (select 1 from public.doubles_teams)
);
alter sequence public.doubles_teams_id_seq owned by public.doubles_teams.id;
alter table public.doubles_teams
  alter column id set default nextval('public.doubles_teams_id_seq'::regclass);

revoke all privileges on table public.doubles_teams from anon;
revoke truncate, references, trigger on table public.doubles_teams from authenticated;

drop policy if exists "Site admins read Doubles teams" on public.doubles_teams;
drop policy if exists "Site admins insert Doubles teams" on public.doubles_teams;
drop policy if exists "Site admins update Doubles teams" on public.doubles_teams;
drop policy if exists "Site admins delete Doubles teams" on public.doubles_teams;

create policy "Site admins read Doubles teams"
on public.doubles_teams for select
to authenticated
using ((select public.is_current_user_site_admin()));

create policy "Site admins insert Doubles teams"
on public.doubles_teams for insert
to authenticated
with check ((select public.is_current_user_site_admin()));

create policy "Site admins update Doubles teams"
on public.doubles_teams for update
to authenticated
using ((select public.is_current_user_site_admin()))
with check ((select public.is_current_user_site_admin()));

create policy "Site admins delete Doubles teams"
on public.doubles_teams for delete
to authenticated
using ((select public.is_current_user_site_admin()));

grant select, insert, update, delete on table public.doubles_teams to authenticated;
grant usage on sequence public.doubles_teams_id_seq to authenticated;

-- Legacy cup tracking remains browser-driven, but it is an admin tool. Its
-- former PUBLIC policies allowed any caller to alter operational rows.
revoke all privileges on table public.player_tracker from anon;
revoke truncate, references, trigger on table public.player_tracker from authenticated;

drop policy if exists "allow insert" on public.player_tracker;
drop policy if exists "allow update" on public.player_tracker;
drop policy if exists "allow select" on public.player_tracker;

create policy "Site admins manage player tracker"
on public.player_tracker for all
to authenticated
using ((select public.is_current_user_site_admin()))
with check ((select public.is_current_user_site_admin()));

grant select, insert, update, delete on table public.player_tracker to authenticated;

revoke insert, update, delete, truncate, references, trigger on table public.bracket_results from anon;
revoke truncate, references, trigger on table public.bracket_results from authenticated;

drop policy if exists "allow bracket results insert" on public.bracket_results;

create policy "Site admins insert bracket results"
on public.bracket_results for insert
to authenticated
with check ((select public.is_current_user_site_admin()));

grant select, insert on table public.bracket_results to authenticated;

-- Registration now enters through register_current_discord_player(); the table
-- itself is an admin-readable queue, not a public data API.
revoke all privileges on table public.player_waitlist from anon;
revoke insert, update, delete, truncate, references, trigger on table public.player_waitlist from authenticated;

drop policy if exists "allow insert waitlist" on public.player_waitlist;
drop policy if exists "allow select waitlist" on public.player_waitlist;
drop policy if exists "allow update waitlist" on public.player_waitlist;
drop policy if exists "Allow authenticated registrations" on public.player_waitlist;
drop policy if exists "Site admins read player waitlist" on public.player_waitlist;

create policy "Site admins read player waitlist"
on public.player_waitlist for select
to authenticated
using ((select public.is_current_user_site_admin()));

grant select on table public.player_waitlist to authenticated;

commit;
