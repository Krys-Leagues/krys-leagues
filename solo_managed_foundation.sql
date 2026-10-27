begin;

create table if not exists public.solo_roster_versions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  version_number integer not null default 1 check (version_number > 0),
  status text not null default 'draft' check (status in ('draft', 'approved', 'locked', 'cancelled')),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  approval_note text,
  locked_at timestamptz,
  locked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, version_number)
);

create unique index if not exists solo_roster_versions_current_season_uidx
  on public.solo_roster_versions(season_id) where status in ('draft', 'approved');

create table if not exists public.solo_roster_entries (
  id uuid primary key default gen_random_uuid(),
  roster_version_id uuid not null references public.solo_roster_versions(id) on delete restrict,
  season_id uuid not null references public.seasons(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  player_screen_name text not null,
  division text not null check (division in ('Master','Elite','League 1','League 2','League 3','League 4')),
  display_order integer not null default 1 check (display_order > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (roster_version_id, player_id),
  unique (roster_version_id, division, display_order)
);

create table if not exists public.solo_weeks (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  week_number smallint not null check (week_number between 1 and 4),
  course_name text,
  status text not null default 'open' check (status in ('open', 'closed')),
  due_date date,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, week_number),
  check ((status = 'open' and closed_at is null and closed_by is null) or status = 'closed')
);

create or replace function public.set_solo_updated_at() returns trigger
language plpgsql set search_path to '' as $function$
begin new.updated_at := now(); return new; end;
$function$;

create or replace function public.normalize_solo_roster_entry() returns trigger
language plpgsql security definer set search_path to '' as $function$
declare v_season_id uuid;
begin
  select season_id into v_season_id from public.solo_roster_versions where id = new.roster_version_id;
  if not found or v_season_id <> new.season_id then raise exception 'Solo roster entry season does not match its roster version'; end if;
  select screen_name into new.player_screen_name from public.players where id = new.player_id;
  if not found then raise exception 'Selected Solo player does not exist'; end if;
  if lower(btrim(new.player_screen_name)) = 'bye' then raise exception 'BYE is not a Solo player identity'; end if;
  return new;
end;
$function$;

drop trigger if exists solo_roster_versions_updated_at on public.solo_roster_versions;
create trigger solo_roster_versions_updated_at before update on public.solo_roster_versions for each row execute function public.set_solo_updated_at();
drop trigger if exists solo_roster_entries_updated_at on public.solo_roster_entries;
create trigger solo_roster_entries_updated_at before update on public.solo_roster_entries for each row execute function public.set_solo_updated_at();
drop trigger if exists solo_weeks_updated_at on public.solo_weeks;
create trigger solo_weeks_updated_at before update on public.solo_weeks for each row execute function public.set_solo_updated_at();
drop trigger if exists normalize_solo_roster_entry on public.solo_roster_entries;
create trigger normalize_solo_roster_entry before insert or update on public.solo_roster_entries for each row execute function public.normalize_solo_roster_entry();

alter table public.solo_roster_versions enable row level security;
alter table public.solo_roster_entries enable row level security;
alter table public.solo_weeks enable row level security;
create policy "Authenticated users can read Solo roster versions" on public.solo_roster_versions for select to authenticated using (true);
create policy "Authenticated users can read Solo roster entries" on public.solo_roster_entries for select to authenticated using (true);
create policy "Authenticated users can read Solo weeks" on public.solo_weeks for select to authenticated using (true);
grant select on public.solo_roster_versions, public.solo_roster_entries, public.solo_weeks to authenticated;
revoke insert, update, delete on public.solo_roster_versions, public.solo_roster_entries, public.solo_weeks from anon, authenticated;

commit;
