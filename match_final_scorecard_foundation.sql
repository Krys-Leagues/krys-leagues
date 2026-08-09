begin;

create table if not exists public.match_final_scorecards (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  source_roster_version_id uuid not null references public.match_roster_versions(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'approved', 'cancelled')),
  approved_at timestamptz null,
  approved_by uuid null references auth.users(id) on delete set null,
  approval_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint match_final_scorecard_id_season_key unique (id, season_id)
);

create unique index if not exists match_final_scorecards_draft_season_uidx
  on public.match_final_scorecards(season_id) where status = 'draft';
create unique index if not exists match_final_scorecards_approved_season_uidx
  on public.match_final_scorecards(season_id) where status = 'approved';

create table if not exists public.match_final_scorecard_entries (
  id uuid primary key default gen_random_uuid(),
  scorecard_id uuid not null,
  season_id uuid not null references public.seasons(id) on delete restrict,
  division_number integer not null check (division_number > 0),
  division_rank integer not null check (division_rank > 0),
  player_id uuid not null references public.players(id) on delete restrict,
  player_screen_name text not null check (btrim(player_screen_name) <> ''),
  completed_game_count integer not null default 0 check (completed_game_count >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  ties integer not null default 0 check (ties >= 0),
  points integer not null default 0 check (points >= 0),
  holes_won integer not null default 0,
  game1_course text null,
  game1_outcome text null check (game1_outcome in ('W', 'L', 'D')),
  game1_hw integer null,
  game2_course text null,
  game2_outcome text null check (game2_outcome in ('W', 'L', 'D')),
  game2_hw integer null,
  game3_course text null,
  game3_outcome text null check (game3_outcome in ('W', 'L', 'D')),
  game3_hw integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint match_final_scorecard_entry_parent_fkey foreign key (scorecard_id, season_id)
    references public.match_final_scorecards(id, season_id) on delete restrict,
  constraint match_final_scorecard_entry_player_key unique (scorecard_id, player_id),
  constraint match_final_scorecard_entry_rank_key unique (scorecard_id, division_number, division_rank)
);

create or replace function public.protect_approved_match_final_scorecard()
returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  if exists (
    select 1 from public.match_final_scorecards as scorecard
    where scorecard.id = coalesce(old.scorecard_id, new.scorecard_id)
      and scorecard.status = 'approved'
  ) then
    raise exception 'Approved Match Final Scorecard entries are immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

drop trigger if exists protect_approved_match_scorecard_entries on public.match_final_scorecard_entries;
create trigger protect_approved_match_scorecard_entries
before update or delete on public.match_final_scorecard_entries
for each row execute function public.protect_approved_match_final_scorecard();

drop trigger if exists match_final_scorecards_updated_at_trigger on public.match_final_scorecards;
create trigger match_final_scorecards_updated_at_trigger
before update on public.match_final_scorecards
for each row execute function public.set_match_managed_updated_at();
drop trigger if exists match_final_scorecard_entries_updated_at_trigger on public.match_final_scorecard_entries;
create trigger match_final_scorecard_entries_updated_at_trigger
before update on public.match_final_scorecard_entries
for each row execute function public.set_match_managed_updated_at();

alter table public.match_final_scorecards enable row level security;
alter table public.match_final_scorecard_entries enable row level security;
drop policy if exists "Authenticated users can read Match Final Scorecards" on public.match_final_scorecards;
create policy "Authenticated users can read Match Final Scorecards"
  on public.match_final_scorecards for select to authenticated using (true);
drop policy if exists "Authenticated users can read Match Final Scorecard entries" on public.match_final_scorecard_entries;
create policy "Authenticated users can read Match Final Scorecard entries"
  on public.match_final_scorecard_entries for select to authenticated using (true);
grant select on public.match_final_scorecards, public.match_final_scorecard_entries to authenticated;
revoke insert, update, delete on public.match_final_scorecards, public.match_final_scorecard_entries from anon, authenticated;
revoke all on function public.protect_approved_match_final_scorecard() from public, anon, authenticated;

commit;
