-- Staging-only security chunk 2E: Player Profile support tables.
-- Keep profile preferences and approved backgrounds behind their existing RPCs.
-- Preserve public trophy reads while restricting direct trophy writes to site admins.

begin;

alter table public.player_profile_preferences enable row level security;
alter table public.approved_player_profile_backgrounds enable row level security;
alter table public.player_trophies enable row level security;

revoke all on table public.player_profile_preferences from public, anon, authenticated;
revoke all on table public.approved_player_profile_backgrounds from public, anon, authenticated;
revoke all on table public.player_trophies from public, anon, authenticated;

grant all on table public.player_profile_preferences to service_role;
grant all on table public.approved_player_profile_backgrounds to service_role;
grant all on table public.player_trophies to service_role;

grant select on table public.player_trophies to anon, authenticated;
grant insert, update, delete on table public.player_trophies to authenticated;

drop policy if exists chunk2e_public_read_player_trophies on public.player_trophies;
drop policy if exists chunk2e_site_admin_insert_player_trophies on public.player_trophies;
drop policy if exists chunk2e_site_admin_update_player_trophies on public.player_trophies;
drop policy if exists chunk2e_site_admin_delete_player_trophies on public.player_trophies;

create policy chunk2e_public_read_player_trophies
  on public.player_trophies
  for select
  to anon, authenticated
  using (true);

create policy chunk2e_site_admin_insert_player_trophies
  on public.player_trophies
  for insert
  to authenticated
  with check ((select public.is_current_user_site_admin()));

create policy chunk2e_site_admin_update_player_trophies
  on public.player_trophies
  for update
  to authenticated
  using ((select public.is_current_user_site_admin()))
  with check ((select public.is_current_user_site_admin()));

create policy chunk2e_site_admin_delete_player_trophies
  on public.player_trophies
  for delete
  to authenticated
  using ((select public.is_current_user_site_admin()));

commit;
