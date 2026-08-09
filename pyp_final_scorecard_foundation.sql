begin;

create table if not exists public.pyp_final_scorecards (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  source_roster_version_id uuid not null references public.pyp_roster_versions(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft','approved','cancelled')),
  source_change_revision integer not null check (source_change_revision >= 0),
  approved_at timestamptz null,
  approved_by uuid null references auth.users(id) on delete set null,
  approval_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pyp_final_scorecard_id_season_key unique(id, season_id)
);
create unique index if not exists pyp_final_scorecards_draft_season_uidx on public.pyp_final_scorecards(season_id) where status='draft';
create unique index if not exists pyp_final_scorecards_approved_season_uidx on public.pyp_final_scorecards(season_id) where status='approved';

create table if not exists public.pyp_final_scorecard_entries (
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
  holes_won integer not null default 0 check (holes_won >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pyp_final_scorecard_entry_parent_fkey foreign key(scorecard_id,season_id) references public.pyp_final_scorecards(id,season_id) on delete restrict,
  constraint pyp_final_scorecard_entry_player_key unique(scorecard_id,player_id),
  constraint pyp_final_scorecard_entry_rank_key unique(scorecard_id,division_number,division_rank)
);

create table if not exists public.pyp_final_scorecard_fixture_details (
  id uuid primary key default gen_random_uuid(),
  scorecard_id uuid not null,
  season_id uuid not null references public.seasons(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  opponent_player_id uuid not null references public.players(id) on delete restrict,
  opponent_screen_name text not null check (btrim(opponent_screen_name) <> ''),
  division_number integer not null check (division_number > 0),
  game_number integer not null check (game_number between 1 and 3),
  player_role text not null check (player_role in ('home','away')),
  course1_name text not null,
  course1_player_hw integer not null check (course1_player_hw >= 0),
  course1_opponent_hw integer not null check (course1_opponent_hw >= 0),
  course2_name text not null,
  course2_player_hw integer not null check (course2_player_hw >= 0),
  course2_opponent_hw integer not null check (course2_opponent_hw >= 0),
  player_total_hw integer not null check (player_total_hw >= 0),
  opponent_total_hw integer not null check (opponent_total_hw >= 0),
  outcome text not null check (outcome in ('W','L','D')),
  created_at timestamptz not null default now(),
  constraint pyp_scorecard_fixture_parent_fkey foreign key(scorecard_id,season_id) references public.pyp_final_scorecards(id,season_id) on delete restrict,
  constraint pyp_scorecard_fixture_player_game_key unique(scorecard_id,player_id,game_number)
);

create or replace function public.protect_approved_pyp_final_scorecard()
returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  if exists(select 1 from public.pyp_final_scorecards card where card.id=coalesce(old.scorecard_id,new.scorecard_id) and card.status='approved') then
    raise exception 'Approved PYP Final Scorecard data is immutable';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;

drop trigger if exists protect_approved_pyp_scorecard_entries on public.pyp_final_scorecard_entries;
create trigger protect_approved_pyp_scorecard_entries before update or delete on public.pyp_final_scorecard_entries for each row execute function public.protect_approved_pyp_final_scorecard();
drop trigger if exists protect_approved_pyp_scorecard_details on public.pyp_final_scorecard_fixture_details;
create trigger protect_approved_pyp_scorecard_details before update or delete on public.pyp_final_scorecard_fixture_details for each row execute function public.protect_approved_pyp_final_scorecard();
drop trigger if exists pyp_final_scorecards_updated_at_trigger on public.pyp_final_scorecards;
create trigger pyp_final_scorecards_updated_at_trigger before update on public.pyp_final_scorecards for each row execute function public.set_pyp_managed_updated_at();
drop trigger if exists pyp_final_scorecard_entries_updated_at_trigger on public.pyp_final_scorecard_entries;
create trigger pyp_final_scorecard_entries_updated_at_trigger before update on public.pyp_final_scorecard_entries for each row execute function public.set_pyp_managed_updated_at();

alter table public.pyp_final_scorecards enable row level security;
alter table public.pyp_final_scorecard_entries enable row level security;
alter table public.pyp_final_scorecard_fixture_details enable row level security;
drop policy if exists "Authenticated users can read PYP Final Scorecards" on public.pyp_final_scorecards;
create policy "Authenticated users can read PYP Final Scorecards" on public.pyp_final_scorecards for select to authenticated using(true);
drop policy if exists "Authenticated users can read PYP Final Scorecard entries" on public.pyp_final_scorecard_entries;
create policy "Authenticated users can read PYP Final Scorecard entries" on public.pyp_final_scorecard_entries for select to authenticated using(true);
drop policy if exists "Authenticated users can read PYP Final Scorecard details" on public.pyp_final_scorecard_fixture_details;
create policy "Authenticated users can read PYP Final Scorecard details" on public.pyp_final_scorecard_fixture_details for select to authenticated using(true);
grant select on public.pyp_final_scorecards,public.pyp_final_scorecard_entries,public.pyp_final_scorecard_fixture_details to authenticated;
revoke insert,update,delete on public.pyp_final_scorecards,public.pyp_final_scorecard_entries,public.pyp_final_scorecard_fixture_details from anon,authenticated;
revoke all on function public.protect_approved_pyp_final_scorecard() from public,anon,authenticated;

commit;
