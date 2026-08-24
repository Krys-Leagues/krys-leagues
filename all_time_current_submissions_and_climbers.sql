begin;

-- Definition only. Do not run in Production without explicit approval.
-- Historical imports remain on apply_all_time_record_import and never call the
-- current-submission/Climbers apply path introduced by this migration.
-- A successfully applied historical import is a non-scoring baseline change at
-- all_time_source_batches.imported_at. It never rewrites or reverses an earlier
-- Climbers event. Only current submissions after that apply timestamp evaluate
-- against the changed all_time_best_records terrain.

create table if not exists public.all_time_records_settings (
  singleton boolean primary key default true check (singleton),
  leaderboard_timezone text not null default 'UTC' check (btrim(leaderboard_timezone) <> ''),
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null
);
insert into public.all_time_records_settings(singleton) values(true) on conflict(singleton) do nothing;

-- Memorial is an independent identity attribute so a player may be inactive or
-- archived while retaining permanent Memorial profile/leaderboard treatment.
alter table public.players add column if not exists is_memorial boolean not null default false;
update public.players set is_memorial=true where lower(coalesce(status::text,''))='memorial';
comment on column public.players.is_memorial is 'Permanent Memorial exception: no current submissions, but profile and legitimate All-Time records remain publicly active and historical imports may still target this canonical UUID.';

alter table public.all_time_best_records add column if not exists active_leaderboard_visible boolean not null default true;
alter table public.all_time_best_records add column if not exists visibility_changed_at timestamptz null;
alter table public.all_time_best_records add column if not exists visibility_reason text null;
create index if not exists all_time_best_active_course_score_idx on public.all_time_best_records(course_id,score,player_id) where active_leaderboard_visible;
comment on column public.all_time_best_records.active_leaderboard_visible is 'Presentation eligibility only. False never deletes the PB or its observation history. Memorial player records must remain true.';

create table if not exists public.all_time_record_submissions (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid null unique references public.all_time_record_observations(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  course_id uuid not null references public.all_time_courses(id) on delete restrict,
  score integer not null,
  historical_player_name text not null check (btrim(historical_player_name) <> ''),
  scorecard_at timestamptz not null,
  discord_submitted_at timestamptz not null,
  room_name text not null check (btrim(room_name) <> ''),
  witness_display_name text not null check (btrim(witness_display_name) <> ''),
  witness_completed_18 boolean not null,
  submitter_server_member_verified boolean not null,
  discord_message_reference text null,
  proof_reference text null,
  admin_notes text null,
  source_type text not null default 'current_submission' check (source_type = 'current_submission'),
  status text not null default 'accepted' check (status in ('accepted','rejected','reversed')),
  rejection_reasons text[] not null default array[]::text[],
  corrects_submission_id uuid null references public.all_time_record_submissions(id) on delete restrict,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  fingerprint text not null unique check (fingerprint ~ '^[0-9a-f]{64}$'),
  metadata jsonb not null default '{}'::jsonb,
  constraint all_time_submission_chronology_check check (scorecard_at <= discord_submitted_at),
  constraint all_time_submission_status_check check (
    (status = 'accepted' and cardinality(rejection_reasons) = 0)
    or (status in ('rejected','reversed') and cardinality(rejection_reasons) > 0)
  )
);
create index if not exists all_time_submissions_chronology_idx on public.all_time_record_submissions(discord_submitted_at,id);
create index if not exists all_time_submissions_player_course_idx on public.all_time_record_submissions(player_id,course_id,discord_submitted_at);
create unique index if not exists all_time_submission_one_correction_uidx on public.all_time_record_submissions(corrects_submission_id) where corrects_submission_id is not null;

create table if not exists public.climbers_seasons (
  id uuid primary key default gen_random_uuid(),
  season_number integer not null unique check (season_number > 0),
  display_name text generated always as ('Season ' || season_number::text) stored,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'upcoming' check (status in ('upcoming','active','awaiting_finalization','finalized')),
  finalized_at timestamptz null,
  finalized_by uuid null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  constraint climbers_season_dates_check check (ends_at > starts_at),
  constraint climbers_finalization_state_check check ((status = 'finalized') = (finalized_at is not null and finalized_by is not null))
);
create unique index if not exists climbers_season_window_uidx on public.climbers_seasons(starts_at,ends_at);
create index if not exists climbers_season_status_idx on public.climbers_seasons(status,starts_at desc);

create table if not exists public.climbers_events (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.climbers_seasons(id) on delete restrict,
  submission_id uuid not null unique references public.all_time_record_submissions(id) on delete restrict,
  observation_id uuid not null unique references public.all_time_record_observations(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  course_id uuid not null references public.all_time_courses(id) on delete restrict,
  discord_submitted_at timestamptz not null,
  previous_pb integer not null,
  new_pb integer not null,
  people_jumped_count integer not null check (people_jumped_count >= 0),
  climbers_points integer not null check (climbers_points >= 0),
  calculation_version text not null,
  calculated_at timestamptz not null default now(),
  reversed_at timestamptz null,
  reversed_by uuid null references auth.users(id) on delete restrict,
  reversal_reason text null,
  superseded_by_event_id uuid null references public.climbers_events(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  constraint climbers_event_improvement_check check (new_pb < previous_pb),
  constraint climbers_event_points_check check (climbers_points = people_jumped_count),
  constraint climbers_event_reversal_check check ((reversed_at is null and reversed_by is null and reversal_reason is null) or (reversed_at is not null and reversed_by is not null and btrim(reversal_reason) <> ''))
);
create index if not exists climbers_events_season_standings_idx on public.climbers_events(season_id,player_id) where reversed_at is null;
create index if not exists climbers_events_chronology_idx on public.climbers_events(course_id,discord_submitted_at,id);

create table if not exists public.climbers_event_passed_players (
  climbers_event_id uuid not null references public.climbers_events(id) on delete restrict,
  passed_player_id uuid not null references public.players(id) on delete restrict,
  passed_player_score integer not null,
  created_at timestamptz not null default now(),
  primary key (climbers_event_id,passed_player_id)
);
create index if not exists climbers_passed_player_history_idx on public.climbers_event_passed_players(passed_player_id,climbers_event_id);

create table if not exists public.climbers_final_standings (
  season_id uuid not null references public.climbers_seasons(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  final_points integer not null check (final_points >= 0),
  final_rank integer not null check (final_rank > 0),
  is_winner boolean not null,
  event_count integer not null check (event_count >= 0),
  snapshot_at timestamptz not null,
  primary key (season_id,player_id)
);
create index if not exists climbers_final_rank_idx on public.climbers_final_standings(season_id,final_rank,player_id);

create table if not exists public.climbers_finalization_archived_cleanup (
  season_id uuid not null references public.climbers_seasons(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  best_record_id uuid not null references public.all_time_best_records(id) on delete restrict,
  action text not null check(action in ('hidden_normal_archived','kept_memorial')),
  processed_at timestamptz not null default now(),
  processed_by uuid not null references auth.users(id) on delete restrict,
  primary key(season_id,best_record_id)
);

create table if not exists public.player_achievements (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete restrict,
  achievement_type text not null check (achievement_type in ('climber_of_the_season','climbers_champion')),
  title text not null check (btrim(title) <> ''),
  season_id uuid null references public.climbers_seasons(id) on delete restrict,
  calendar_year integer null check (calendar_year is null or calendar_year >= 2000),
  points integer not null check (points >= 0),
  awarded_at timestamptz not null default now(),
  awarded_by uuid not null references auth.users(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  constraint player_achievement_scope_check check (
    (achievement_type = 'climber_of_the_season' and season_id is not null and calendar_year is null)
    or (achievement_type = 'climbers_champion' and season_id is null and calendar_year is not null)
  )
);
create unique index if not exists player_climber_season_achievement_uidx on public.player_achievements(player_id,achievement_type,season_id) where season_id is not null;
create unique index if not exists player_climbers_year_achievement_uidx on public.player_achievements(player_id,achievement_type,calendar_year) where calendar_year is not null;

alter table public.all_time_records_settings enable row level security;
alter table public.all_time_record_submissions enable row level security;
alter table public.climbers_seasons enable row level security;
alter table public.climbers_events enable row level security;
alter table public.climbers_event_passed_players enable row level security;
alter table public.climbers_final_standings enable row level security;
alter table public.climbers_finalization_archived_cleanup enable row level security;
alter table public.player_achievements enable row level security;

drop policy if exists all_time_records_settings_admin_read on public.all_time_records_settings;
drop policy if exists all_time_record_submissions_admin_read on public.all_time_record_submissions;
drop policy if exists climbers_seasons_public_read on public.climbers_seasons;
drop policy if exists climbers_events_admin_read on public.climbers_events;
drop policy if exists climbers_passed_players_admin_read on public.climbers_event_passed_players;
drop policy if exists climbers_final_standings_public_read on public.climbers_final_standings;
drop policy if exists player_achievements_public_read on public.player_achievements;
drop policy if exists climbers_archived_cleanup_admin_read on public.climbers_finalization_archived_cleanup;
create policy all_time_records_settings_admin_read on public.all_time_records_settings for select to authenticated using(public.is_current_user_site_admin());
create policy all_time_record_submissions_admin_read on public.all_time_record_submissions for select to authenticated using(public.is_current_user_site_admin());
create policy climbers_seasons_public_read on public.climbers_seasons for select to anon,authenticated using(true);
create policy climbers_events_admin_read on public.climbers_events for select to authenticated using(public.is_current_user_site_admin());
create policy climbers_passed_players_admin_read on public.climbers_event_passed_players for select to authenticated using(public.is_current_user_site_admin());
create policy climbers_final_standings_public_read on public.climbers_final_standings for select to anon,authenticated using(true);
create policy player_achievements_public_read on public.player_achievements for select to anon,authenticated using(true);
create policy climbers_archived_cleanup_admin_read on public.climbers_finalization_archived_cleanup for select to authenticated using(public.is_current_user_site_admin());

grant select on public.climbers_seasons,public.climbers_final_standings,public.player_achievements to anon,authenticated;
grant select on public.all_time_records_settings,public.all_time_record_submissions,public.climbers_events,public.climbers_event_passed_players to authenticated;
grant select on public.climbers_finalization_archived_cleanup to authenticated;
revoke insert,update,delete on public.all_time_records_settings,public.all_time_record_submissions,public.climbers_seasons,public.climbers_events,public.climbers_event_passed_players,public.climbers_final_standings,public.player_achievements from public,anon,authenticated;
revoke insert,update,delete on public.climbers_finalization_archived_cleanup from public,anon,authenticated;

-- Mutation is intentionally RPC-only. The apply, correction/replay, season
-- transition, and finalization RPCs should be added after this schema and its
-- chronology decisions are reviewed. No browser service-role path is required.
-- Finalization cleanup must hide only normal archived players. It must exclude
-- players where is_memorial=true, log kept_memorial, and leave their active
-- leaderboard records as terrain that later current players may pass.

commit;
