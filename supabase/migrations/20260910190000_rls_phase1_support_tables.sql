-- Krys Leagues RLS Phase 1 support-table hardening (STAGING ONLY)
--
-- The current application uses these tables as either public read models or
-- site-admin workflow state. No anonymous or ordinary-authenticated write
-- policy is created here. Apply to staging first and re-run the security
-- advisor before considering any production change.

-- This helper exposes only public player UUID mapping. With the public
-- players SELECT policy in place it does not need to bypass RLS.
alter function public.get_public_player_canonical_identity(uuid) security invoker;

-- Public read models. The application reads these from public pages.
alter table public.season_standings enable row level security;
alter table public.player_league_memberships enable row level security;
alter table public.seasons enable row level security;
alter table public.schedule enable row level security;

revoke all on table public.season_standings, public.player_league_memberships, public.seasons, public.schedule
  from public, anon, authenticated;
grant select on table public.season_standings, public.player_league_memberships, public.seasons, public.schedule
  to anon, authenticated;
grant insert, update, delete on table public.season_standings, public.player_league_memberships, public.seasons, public.schedule
  to authenticated;
grant all on table public.season_standings, public.player_league_memberships, public.seasons, public.schedule
  to service_role;

drop policy if exists rls_phase1_public_read_season_standings on public.season_standings;
create policy rls_phase1_public_read_season_standings
  on public.season_standings for select to anon, authenticated using (true);
drop policy if exists rls_phase1_public_read_player_league_memberships on public.player_league_memberships;
create policy rls_phase1_public_read_player_league_memberships
  on public.player_league_memberships for select to anon, authenticated using (true);
drop policy if exists rls_phase1_public_read_seasons on public.seasons;
create policy rls_phase1_public_read_seasons
  on public.seasons for select to anon, authenticated using (true);
drop policy if exists rls_phase1_public_read_schedule on public.schedule;
create policy rls_phase1_public_read_schedule
  on public.schedule for select to anon, authenticated using (true);

drop policy if exists rls_phase1_admin_all_season_standings on public.season_standings;
create policy rls_phase1_admin_all_season_standings
  on public.season_standings for all to authenticated
  using ((select public.is_current_user_site_admin()))
  with check ((select public.is_current_user_site_admin()));
drop policy if exists rls_phase1_admin_all_player_league_memberships on public.player_league_memberships;
create policy rls_phase1_admin_all_player_league_memberships
  on public.player_league_memberships for all to authenticated
  using ((select public.is_current_user_site_admin()))
  with check ((select public.is_current_user_site_admin()));
drop policy if exists rls_phase1_admin_all_seasons on public.seasons;
create policy rls_phase1_admin_all_seasons
  on public.seasons for all to authenticated
  using ((select public.is_current_user_site_admin()))
  with check ((select public.is_current_user_site_admin()));
drop policy if exists rls_phase1_admin_all_schedule on public.schedule;
create policy rls_phase1_admin_all_schedule
  on public.schedule for all to authenticated
  using ((select public.is_current_user_site_admin()))
  with check ((select public.is_current_user_site_admin()));

-- Admin-only application tables. These are read by site-admin pages and
-- mutated through protected RPCs or trusted server paths.
alter table public.player_tournament_entries enable row level security;
alter table public.player_identity_links enable row level security;
alter table public.match_roster_versions enable row level security;
alter table public.match_division_roster_slots enable row level security;
alter table public.match_schedule_state enable row level security;
alter table public.match_final_scorecards enable row level security;
alter table public.stroke_roster_versions enable row level security;
alter table public.stroke_division_roster_slots enable row level security;
alter table public.stroke_schedule_state enable row level security;
alter table public.stroke_final_scorecards enable row level security;

revoke all on table
  public.player_tournament_entries,
  public.player_identity_links,
  public.match_roster_versions,
  public.match_division_roster_slots,
  public.match_schedule_state,
  public.match_final_scorecards,
  public.stroke_roster_versions,
  public.stroke_division_roster_slots,
  public.stroke_schedule_state,
  public.stroke_final_scorecards
  from public, anon, authenticated;

grant select on table
  public.player_tournament_entries,
  public.player_identity_links,
  public.match_roster_versions,
  public.match_division_roster_slots,
  public.match_schedule_state,
  public.match_final_scorecards,
  public.stroke_roster_versions,
  public.stroke_division_roster_slots,
  public.stroke_schedule_state,
  public.stroke_final_scorecards
  to authenticated;
grant insert, update, delete on table public.player_tournament_entries to authenticated;
grant all on table
  public.player_tournament_entries,
  public.player_identity_links,
  public.match_roster_versions,
  public.match_division_roster_slots,
  public.match_schedule_state,
  public.match_final_scorecards,
  public.stroke_roster_versions,
  public.stroke_division_roster_slots,
  public.stroke_schedule_state,
  public.stroke_final_scorecards
  to service_role;

drop policy if exists rls_phase1_admin_all_player_tournament_entries on public.player_tournament_entries;
create policy rls_phase1_admin_all_player_tournament_entries
  on public.player_tournament_entries for all to authenticated
  using ((select public.is_current_user_site_admin()))
  with check ((select public.is_current_user_site_admin()));

drop policy if exists rls_phase1_admin_read_player_identity_links on public.player_identity_links;
create policy rls_phase1_admin_read_player_identity_links
  on public.player_identity_links for select to authenticated
  using ((select public.is_current_user_site_admin()));

drop policy if exists rls_phase1_admin_read_match_roster_versions on public.match_roster_versions;
create policy rls_phase1_admin_read_match_roster_versions
  on public.match_roster_versions for select to authenticated
  using ((select public.is_current_user_site_admin()));
drop policy if exists rls_phase1_admin_read_match_division_roster_slots on public.match_division_roster_slots;
create policy rls_phase1_admin_read_match_division_roster_slots
  on public.match_division_roster_slots for select to authenticated
  using ((select public.is_current_user_site_admin()));
drop policy if exists rls_phase1_admin_read_match_schedule_state on public.match_schedule_state;
create policy rls_phase1_admin_read_match_schedule_state
  on public.match_schedule_state for select to authenticated
  using ((select public.is_current_user_site_admin()));
drop policy if exists rls_phase1_admin_read_match_final_scorecards on public.match_final_scorecards;
create policy rls_phase1_admin_read_match_final_scorecards
  on public.match_final_scorecards for select to authenticated
  using ((select public.is_current_user_site_admin()));

drop policy if exists rls_phase1_admin_read_stroke_roster_versions on public.stroke_roster_versions;
create policy rls_phase1_admin_read_stroke_roster_versions
  on public.stroke_roster_versions for select to authenticated
  using ((select public.is_current_user_site_admin()));
drop policy if exists rls_phase1_admin_read_stroke_division_roster_slots on public.stroke_division_roster_slots;
create policy rls_phase1_admin_read_stroke_division_roster_slots
  on public.stroke_division_roster_slots for select to authenticated
  using ((select public.is_current_user_site_admin()));
drop policy if exists rls_phase1_admin_read_stroke_schedule_state on public.stroke_schedule_state;
create policy rls_phase1_admin_read_stroke_schedule_state
  on public.stroke_schedule_state for select to authenticated
  using ((select public.is_current_user_site_admin()));
drop policy if exists rls_phase1_admin_read_stroke_final_scorecards on public.stroke_final_scorecards;
create policy rls_phase1_admin_read_stroke_final_scorecards
  on public.stroke_final_scorecards for select to authenticated
  using ((select public.is_current_user_site_admin()));
