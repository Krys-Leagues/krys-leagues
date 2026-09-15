-- PREPARED MIGRATION ONLY. Do not run in Production without Krys approval.
-- Forward-only. No historical memberships, scores, identities, or source rows are rewritten or deleted.

do $$
begin
  if exists (
    select 1
    from public.player_leagues
    group by player_id, lower(btrim(league_type))
    having count(*) > 1
  ) then
    raise exception 'player_leagues has duplicate current player/league rows; review exact conflicts before applying roster uniqueness';
  end if;
end
$$;

create unique index if not exists player_leagues_current_player_league_type_uidx
  on public.player_leagues (player_id, lower(btrim(league_type)));

comment on index public.player_leagues_current_player_league_type_uidx is
  'Current roster contract: one row per canonical player and league type; division may change without rewriting historical memberships.';

create table if not exists public.current_player_list_entries (
  id uuid primary key default gen_random_uuid(),
  list_key text not null check (list_key in ('all_time', 'monthly', 'kwt')),
  player_id uuid not null references public.players(id) on delete restrict,
  added_at timestamptz not null default now(),
  added_by uuid null references auth.users(id) on delete set null,
  unique (list_key, player_id)
);

create index if not exists current_player_list_entries_player_id_idx
  on public.current_player_list_entries (player_id);

alter table public.current_player_list_entries enable row level security;
revoke all on table public.current_player_list_entries from anon, authenticated;

comment on table public.current_player_list_entries is
  'Admin-maintained current All-Time, Monthly, and KWT lists. Historical participation remains in each system''s source tables.';
