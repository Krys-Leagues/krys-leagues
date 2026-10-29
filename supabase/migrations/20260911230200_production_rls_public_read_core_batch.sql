-- Production RLS batch: public read models with protected writes.

alter table public.season_standings enable row level security;

revoke all on table public.season_standings from public, anon, authenticated;

grant select on table public.season_standings to anon, authenticated;

grant all on table public.season_standings to service_role;

drop policy if exists production_public_read_season_standings on public.season_standings;
create policy production_public_read_season_standings
  on public.season_standings for select to anon, authenticated
  using (true);
