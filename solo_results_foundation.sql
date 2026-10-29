begin;

create table public.solo_score_attempts (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  week_id uuid not null references public.solo_weeks(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  difficulty text not null check (difficulty in ('easy','hard')),
  stroke_score integer not null,
  hn1_count integer not null check (hn1_count >= 0),
  entered_by uuid not null references auth.users(id) on delete restrict,
  entered_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create index solo_score_attempts_lookup_idx on public.solo_score_attempts(week_id,player_id,difficulty,stroke_score,hn1_count desc,entered_at,id);

create table public.solo_week_snapshots (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  week_id uuid not null references public.solo_weeks(id) on delete restrict,
  week_number smallint not null check (week_number between 1 and 4),
  revision integer not null check (revision > 0),
  course_name text,
  closed_at timestamptz not null,
  closed_by uuid not null references auth.users(id) on delete restrict,
  is_current boolean not null default true,
  superseded_at timestamptz,
  superseded_by uuid references auth.users(id) on delete restrict,
  unique (week_id, revision)
);
create unique index solo_week_snapshots_current_uidx on public.solo_week_snapshots(week_id) where is_current;

create table public.solo_week_snapshot_entries (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.solo_week_snapshots(id) on delete restrict,
  season_id uuid not null references public.seasons(id) on delete restrict,
  week_id uuid not null references public.solo_weeks(id) on delete restrict,
  week_number smallint not null check (week_number between 1 and 4),
  division text not null check (division in ('Master','Elite','League 1','League 2','League 3','League 4')),
  display_order integer not null check (display_order > 0),
  player_id uuid not null references public.players(id) on delete restrict,
  player_screen_name text not null,
  course_name text,
  easy_attempt_id uuid references public.solo_score_attempts(id) on delete restrict,
  easy_stroke_score integer,
  easy_hn1_count integer,
  hard_attempt_id uuid references public.solo_score_attempts(id) on delete restrict,
  hard_stroke_score integer,
  hard_hn1_count integer,
  most_hn1_easy integer,
  most_hn1_hard integer,
  created_at timestamptz not null default now(),
  unique (snapshot_id, player_id),
  check ((easy_attempt_id is null and easy_stroke_score is null and easy_hn1_count is null) or (easy_attempt_id is not null and easy_stroke_score is not null and easy_hn1_count is not null)),
  check ((hard_attempt_id is null and hard_stroke_score is null and hard_hn1_count is null) or (hard_attempt_id is not null and hard_stroke_score is not null and hard_hn1_count is not null))
);

create view public.solo_live_best_attempts as
select id,season_id,week_id,player_id,difficulty,stroke_score,hn1_count,entered_at
from (
  select a.*, row_number() over(partition by a.week_id,a.player_id,a.difficulty order by a.stroke_score,a.hn1_count desc,a.entered_at,a.id) as selection_order
  from public.solo_score_attempts a
) ranked where selection_order=1;

create view public.solo_live_hn1_recognition as
select season_id,week_id,player_id,difficulty,max(hn1_count) as most_hn1
from public.solo_score_attempts group by season_id,week_id,player_id,difficulty;

alter table public.solo_score_attempts enable row level security;
alter table public.solo_week_snapshots enable row level security;
alter table public.solo_week_snapshot_entries enable row level security;
create policy "Authenticated users can read Solo attempts" on public.solo_score_attempts for select to authenticated using (true);
create policy "Authenticated users can read Solo snapshots" on public.solo_week_snapshots for select to authenticated using (true);
create policy "Authenticated users can read Solo snapshot entries" on public.solo_week_snapshot_entries for select to authenticated using (true);
grant select on public.solo_score_attempts,public.solo_week_snapshots,public.solo_week_snapshot_entries,public.solo_live_best_attempts,public.solo_live_hn1_recognition to authenticated;
revoke insert,update,delete on public.solo_score_attempts,public.solo_week_snapshots,public.solo_week_snapshot_entries from anon,authenticated;

commit;
