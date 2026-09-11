-- Production RLS: expose only verified aliases to directory readers.

alter table public.player_aliases enable row level security;

revoke all on table public.player_aliases from public, anon, authenticated;
grant select on table public.player_aliases to anon, authenticated;
grant all on table public.player_aliases to service_role;

drop policy if exists production_public_read_verified_player_aliases on public.player_aliases;
create policy production_public_read_verified_player_aliases
  on public.player_aliases for select to anon, authenticated
  using (verified = true);
