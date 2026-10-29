-- Production RLS batch: admin-only support readers.

alter table public.discord_members enable row level security;
alter table public.handicap_rounds enable row level security;
alter table public.player_career_events enable row level security;

revoke all on table
  public.discord_members,
  public.handicap_rounds,
  public.player_career_events
from public, anon, authenticated;

grant select on table
  public.discord_members,
  public.handicap_rounds,
  public.player_career_events
to authenticated;

grant all on table
  public.discord_members,
  public.handicap_rounds,
  public.player_career_events
to service_role;

drop policy if exists production_site_admin_read_discord_members on public.discord_members;
create policy production_site_admin_read_discord_members
  on public.discord_members for select to authenticated
  using ((select public.is_current_user_site_admin()));

drop policy if exists production_site_admin_read_handicap_rounds on public.handicap_rounds;
create policy production_site_admin_read_handicap_rounds
  on public.handicap_rounds for select to authenticated
  using ((select public.is_current_user_site_admin()));

drop policy if exists production_site_admin_read_player_career_events on public.player_career_events;
create policy production_site_admin_read_player_career_events
  on public.player_career_events for select to authenticated
  using ((select public.is_current_user_site_admin()));
