-- Final Production RLS gate for the four remaining public tables.
-- Public/player/admin readers use the protected application routes/RPCs.
-- No data rows are modified by this migration.

drop policy if exists "Allow insert players" on public.players;
drop policy if exists "Allow read players" on public.players;
drop policy if exists "allow insert players" on public.players;
drop policy if exists "allow select players" on public.players;

drop policy if exists "Allow public delete results" on public.results;
drop policy if exists "Allow public insert results" on public.results;
drop policy if exists "Allow public read results" on public.results;
drop policy if exists "Allow public update results" on public.results;

alter table public.players enable row level security;
alter table public.results enable row level security;
alter table public.player_league_memberships enable row level security;
alter table public.schedule enable row level security;

revoke all privileges on table
  public.players,
  public.results,
  public.player_league_memberships,
  public.schedule
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.players,
  public.results,
  public.player_league_memberships,
  public.schedule
to service_role;
