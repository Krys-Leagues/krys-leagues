-- REVIEW ONLY. Do not apply to Production as part of website Preview work.
-- Lynne's reusable tournament builder: immutable template snapshots, protected
-- registrations, explicit 32/64 single-elimination graphs, and append-only audit.

begin;

create table if not exists public.tournament_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  description text not null default '',
  bracket_size integer not null check (bracket_size in (32, 64)),
  format text not null default 'single_elimination' check (format = 'single_elimination'),
  rules jsonb not null default '{}'::jsonb,
  round_defaults jsonb not null default '[]'::jsonb,
  artwork_path text,
  schedule_preset text not null default 'NORMAL' check (schedule_preset in ('NORMAL', 'ONE_DAY', 'CUSTOM')),
  schedule_timezone text not null default 'America/New_York',
  start_at timestamptz,
  overall_deadline_at timestamptz,
  registration_deadline_at timestamptz,
  archived_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.tournament_templates(id),
  name text not null check (btrim(name) <> ''),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'draft' check (status in ('draft', 'registration_open', 'registration_closed', 'live', 'completed', 'archived', 'cancelled')),
  bracket_size integer not null check (bracket_size in (32, 64)),
  format text not null default 'single_elimination' check (format = 'single_elimination'),
  registration_capacity integer not null,
  rules jsonb not null default '{}'::jsonb,
  artwork_path text,
  schedule_preset text not null default 'NORMAL' check (schedule_preset in ('NORMAL', 'ONE_DAY', 'CUSTOM')),
  schedule_timezone text not null default 'America/New_York',
  start_at timestamptz,
  overall_deadline_at timestamptz,
  registration_deadline_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  registration_open_at timestamptz,
  registration_closed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (registration_capacity = bracket_size)
);

create table if not exists public.tournament_rounds (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  name text not null check (btrim(name) <> ''),
  course_config jsonb not null default '{}'::jsonb,
  scoring_rules jsonb not null default '{}'::jsonb,
  tiebreaker_rules jsonb not null default '{}'::jsonb,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  deadline_at timestamptz,
  schedule_timezone text,
  is_final boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tournament_id, round_number)
);

create table if not exists public.tournament_registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_id uuid not null references public.players(id),
  status text not null default 'confirmed' check (status in ('confirmed', 'withdrawn')),
  player_timezone text,
  timezone_confirmed_at timestamptz,
  seed integer,
  registered_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  unique (tournament_id, player_id),
  unique (tournament_id, seed)
);

create table if not exists public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  match_number integer not null check (match_number > 0),
  stable_key text not null,
  slot_a jsonb not null,
  slot_b jsonb not null,
  player_a_id uuid references public.players(id),
  player_b_id uuid references public.players(id),
  winner_player_id uuid references public.players(id),
  loser_player_id uuid references public.players(id),
  status text not null default 'pending' check (status in ('pending', 'live', 'completed', 'review')),
  scheduled_at timestamptz,
  deadline_at timestamptz,
  match_timezone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, stable_key),
  unique (tournament_id, round_number, match_number)
);

create table if not exists public.tournament_match_schedule_offers (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.tournament_matches(id) on delete cascade,
  proposed_by uuid not null references public.players(id),
  starts_at timestamptz not null,
  proposed_timezone text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'countered', 'withdrawn')),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create table if not exists public.tournament_match_results (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.tournament_matches(id),
  winner_player_id uuid not null references public.players(id),
  loser_player_id uuid not null references public.players(id),
  score_label text not null check (btrim(score_label) <> ''),
  evidence_reference text not null check (btrim(evidence_reference) <> ''),
  verified_by uuid not null references auth.users(id),
  idempotency_key text not null unique,
  recorded_at timestamptz not null default now(),
  unique (match_id)
);

create table if not exists public.tournament_rule_changes (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  version integer not null check (version > 1),
  old_rules jsonb not null,
  new_rules jsonb not null,
  impact_summary text not null,
  reason text not null,
  changed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (tournament_id, version)
);

create table if not exists public.tournament_audit_log (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- Private control-center history. Evidence, disputes, scheduling, secret-par
-- access, Discord activity, and awards never enter the public bracket projection.
create table if not exists public.tournament_deadline_changes (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  scope text not null check (scope in ('tournament', 'round', 'match')),
  round_id uuid references public.tournament_rounds(id),
  match_id uuid references public.tournament_matches(id),
  old_deadline_at timestamptz,
  new_deadline_at timestamptz not null,
  schedule_timezone text not null,
  reason text not null check (btrim(reason) <> ''),
  changed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.tournament_scorecard_templates (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  definition jsonb not null,
  created_by uuid not null references auth.users(id),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.tournament_scorecard_submissions (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  match_id uuid not null references public.tournament_matches(id),
  player_id uuid not null references public.players(id),
  template_id uuid references public.tournament_scorecard_templates(id),
  evidence_path text not null,
  score_payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  submitted_by uuid not null references auth.users(id),
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.tournament_winner_confirmations (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.tournament_matches(id) on delete cascade,
  player_id uuid not null references public.players(id),
  selected_winner_id uuid not null references public.players(id),
  created_at timestamptz not null default now(),
  unique (match_id, player_id)
);

create table if not exists public.tournament_forfeit_requests (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.tournament_matches(id) on delete cascade,
  requested_by uuid not null references public.players(id),
  explanation text not null check (btrim(explanation) <> ''),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  decided_by uuid references auth.users(id),
  decision_reason text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table if not exists public.tournament_forced_advancements (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.tournament_matches(id) on delete cascade,
  advancing_player_id uuid not null references public.players(id),
  reason text not null check (btrim(reason) <> ''),
  decided_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.tournament_rewinds (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  match_id uuid not null references public.tournament_matches(id),
  reason text not null check (btrim(reason) <> ''),
  affected_match_ids jsonb not null default '[]'::jsonb,
  rewound_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.tournament_secret_par_access (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  designated_admin uuid not null references auth.users(id),
  viewed_by uuid not null references auth.users(id),
  viewed_at timestamptz not null default now(),
  unique (tournament_id, viewed_by)
);

create table if not exists public.tournament_discord_threads (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.tournament_matches(id) on delete cascade,
  discord_thread_id text not null unique,
  status text not null default 'active' check (status in ('active', 'cleanup_pending', 'deleted', 'failed_cleanup')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.tournament_reminder_attempts (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.tournament_matches(id) on delete cascade,
  recipient_player_id uuid not null references public.players(id),
  reminder_kind text not null check (reminder_kind in ('player_1', 'player_2', 'both')),
  outcome text not null check (outcome in ('sent', 'failed')),
  failure_reason text,
  sent_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.tournament_trophy_assets (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  storage_path text not null,
  personalization jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.tournament_awards (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  winner_player_id uuid not null references public.players(id),
  trophy_asset_id uuid references public.tournament_trophy_assets(id),
  personalized_storage_path text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'awarded')),
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (tournament_id, winner_player_id)
);

alter table public.tournament_templates enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_rounds enable row level security;
alter table public.tournament_registrations enable row level security;
alter table public.tournament_matches enable row level security;
alter table public.tournament_match_schedule_offers enable row level security;
alter table public.tournament_match_results enable row level security;
alter table public.tournament_rule_changes enable row level security;
alter table public.tournament_audit_log enable row level security;
alter table public.tournament_deadline_changes enable row level security;
alter table public.tournament_scorecard_templates enable row level security;
alter table public.tournament_scorecard_submissions enable row level security;
alter table public.tournament_winner_confirmations enable row level security;
alter table public.tournament_forfeit_requests enable row level security;
alter table public.tournament_forced_advancements enable row level security;
alter table public.tournament_rewinds enable row level security;
alter table public.tournament_secret_par_access enable row level security;
alter table public.tournament_discord_threads enable row level security;
alter table public.tournament_reminder_attempts enable row level security;
alter table public.tournament_trophy_assets enable row level security;
alter table public.tournament_awards enable row level security;

revoke all on public.tournament_templates, public.tournaments, public.tournament_rounds, public.tournament_registrations, public.tournament_matches, public.tournament_match_schedule_offers, public.tournament_match_results, public.tournament_rule_changes, public.tournament_audit_log, public.tournament_deadline_changes, public.tournament_scorecard_templates, public.tournament_scorecard_submissions, public.tournament_winner_confirmations, public.tournament_forfeit_requests, public.tournament_forced_advancements, public.tournament_rewinds, public.tournament_secret_par_access, public.tournament_discord_threads, public.tournament_reminder_attempts, public.tournament_trophy_assets, public.tournament_awards from public, anon, authenticated;
grant all on public.tournament_templates, public.tournaments, public.tournament_rounds, public.tournament_registrations, public.tournament_matches, public.tournament_match_schedule_offers, public.tournament_match_results, public.tournament_rule_changes, public.tournament_audit_log, public.tournament_deadline_changes, public.tournament_scorecard_templates, public.tournament_scorecard_submissions, public.tournament_winner_confirmations, public.tournament_forfeit_requests, public.tournament_forced_advancements, public.tournament_rewinds, public.tournament_secret_par_access, public.tournament_discord_threads, public.tournament_reminder_attempts, public.tournament_trophy_assets, public.tournament_awards to service_role;

create or replace function public.register_for_tournament(p_tournament_id uuid, p_player_timezone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament public.tournaments%rowtype;
  v_discord_id text;
  v_player_id uuid;
  v_registration_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication is required' using errcode = '42501'; end if;
  select coalesce(identity_data ->> 'provider_id', identity_data ->> 'id', identity_data ->> 'sub') into v_discord_id
  from auth.identities where user_id = auth.uid() and provider = 'discord' limit 1;
  if p_tournament_id is null then raise exception 'Tournament is required'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = btrim(p_player_timezone)) then raise exception 'A valid IANA player time zone is required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tournament-registration:' || p_tournament_id::text, 0));
  select * into v_tournament from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'Tournament was not found'; end if;
  if v_tournament.status <> 'registration_open' then raise exception 'Registration is not open'; end if;
  if v_discord_id is null then raise exception 'Discord identity could not be verified' using errcode = '42501'; end if;
  select public.resolve_canonical_player_id(player.id) into v_player_id
  from public.players as player where nullif(btrim(player.discord_id), '') = v_discord_id and player.active = true limit 1;
  if v_player_id is null then raise exception 'No active canonical Global Player is linked to this Discord account' using errcode = '42501'; end if;
  if exists (select 1 from public.tournament_registrations where tournament_id = p_tournament_id and player_id = v_player_id and status = 'confirmed') then raise exception 'This player is already registered'; end if;
  if (select count(*) from public.tournament_registrations where tournament_id = p_tournament_id and status = 'confirmed') >= v_tournament.registration_capacity then raise exception 'This tournament is full'; end if;
  insert into public.tournament_registrations(tournament_id, player_id, status, player_timezone, timezone_confirmed_at) values (p_tournament_id, v_player_id, 'confirmed', btrim(p_player_timezone), now()) returning id into v_registration_id;
  return jsonb_build_object('registration_id', v_registration_id, 'tournament_id', p_tournament_id, 'player_id', v_player_id, 'status', 'confirmed');
end;
$$;

revoke all on function public.register_for_tournament(uuid, text) from public, anon;
grant execute on function public.register_for_tournament(uuid, text) to authenticated, service_role;

create or replace function public.admin_create_tournament(
  p_name text,
  p_slug text,
  p_template_id uuid,
  p_bracket_size integer,
  p_status text,
  p_rules jsonb,
  p_rounds jsonb,
  p_entrants jsonb,
  p_schedule_preset text,
  p_schedule_timezone text,
  p_start_at timestamptz,
  p_overall_deadline_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament_id uuid;
  v_round integer;
  v_match integer;
  v_rounds integer;
  v_match_count integer;
  v_first_seed integer;
  v_player_id uuid;
  v_seed integer;
  v_player_timezone text;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode = '42501'; end if;
  if p_bracket_size not in (32, 64) then raise exception 'Bracket size must be 32 or 64'; end if;
  if coalesce(p_schedule_preset, 'NORMAL') not in ('NORMAL', 'ONE_DAY', 'CUSTOM') then raise exception 'Invalid schedule preset'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = btrim(coalesce(p_schedule_timezone, 'America/New_York'))) then raise exception 'A valid IANA schedule time zone is required'; end if;
  if jsonb_array_length(p_entrants) <> p_bracket_size then raise exception 'Confirmed participant selection must exactly fill the bracket'; end if;
  v_rounds := floor(log(2, p_bracket_size))::integer;
  if jsonb_typeof(coalesce(p_rounds, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_rounds, '[]'::jsonb)) <> v_rounds then raise exception 'Every bracket round must have an explicit course and rules snapshot'; end if;
  if p_status not in ('draft', 'registration_open', 'registration_closed') then raise exception 'A tournament can only be created before it goes live'; end if;
  insert into public.tournaments(name, slug, template_id, bracket_size, registration_capacity, status, rules, schedule_preset, schedule_timezone, start_at, overall_deadline_at, created_by)
  values (btrim(p_name), lower(btrim(p_slug)), p_template_id, p_bracket_size, p_bracket_size, p_status, coalesce(p_rules, '{}'::jsonb), coalesce(p_schedule_preset, 'NORMAL'), btrim(coalesce(p_schedule_timezone, 'America/New_York')), p_start_at, p_overall_deadline_at, auth.uid()) returning id into v_tournament_id;
  for v_seed in 1..p_bracket_size loop
    v_player_id := public.resolve_canonical_player_id((p_entrants -> (v_seed - 1) ->> 'player_id')::uuid);
    if v_player_id is null then raise exception 'Every selected entrant must resolve to a canonical Global Player'; end if;
    v_player_timezone := btrim(p_entrants -> (v_seed - 1) ->> 'player_timezone');
    if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_player_timezone) then raise exception 'Every entrant must have a confirmed IANA player time zone'; end if;
    insert into public.tournament_registrations(tournament_id, player_id, seed, status, player_timezone, timezone_confirmed_at) values (v_tournament_id, v_player_id, v_seed, 'confirmed', v_player_timezone, now());
  end loop;
  for v_round in 1..v_rounds loop
    insert into public.tournament_rounds(tournament_id, round_number, name, is_final, course_config, scoring_rules, tiebreaker_rules)
    values (v_tournament_id, v_round, case when v_round = v_rounds then 'Final' else 'Round ' || v_round end, v_round = v_rounds, coalesce(p_rounds -> (v_round - 1) -> 'course_config', '{}'::jsonb), coalesce(p_rounds -> (v_round - 1) -> 'scoring_rules', '{}'::jsonb), coalesce(p_rounds -> (v_round - 1) -> 'tiebreaker_rules', '{}'::jsonb));
    v_match_count := p_bracket_size / (2 ^ v_round);
    for v_match in 1..v_match_count loop
      if v_round = 1 then
        v_first_seed := ((v_match - 1) * 2) + 1;
        insert into public.tournament_matches(tournament_id, round_number, match_number, stable_key, slot_a, slot_b, player_a_id, player_b_id)
        values (v_tournament_id, v_round, v_match, 'r1m' || v_match, jsonb_build_object('type','seed','seed',v_first_seed), jsonb_build_object('type','seed','seed',v_first_seed + 1), (select player_id from public.tournament_registrations where tournament_id = v_tournament_id and seed = v_first_seed), (select player_id from public.tournament_registrations where tournament_id = v_tournament_id and seed = v_first_seed + 1));
      else
        v_first_seed := ((v_match - 1) * 2) + 1;
        insert into public.tournament_matches(tournament_id, round_number, match_number, stable_key, slot_a, slot_b)
        values (v_tournament_id, v_round, v_match, 'r' || v_round || 'm' || v_match, jsonb_build_object('type','match','match_key','r' || (v_round - 1) || 'm' || v_first_seed,'outcome','winner'), jsonb_build_object('type','match','match_key','r' || (v_round - 1) || 'm' || (v_first_seed + 1),'outcome','winner'));
      end if;
    end loop;
  end loop;
  insert into public.tournament_audit_log(tournament_id, action, details, actor_id) values (v_tournament_id, 'created', jsonb_build_object('bracket_size', p_bracket_size, 'template_id', p_template_id), auth.uid());
  return v_tournament_id;
end;
$$;

revoke all on function public.admin_create_tournament(text, text, uuid, integer, text, jsonb, jsonb, jsonb, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_create_tournament(text, text, uuid, integer, text, jsonb, jsonb, jsonb, text, text, timestamptz, timestamptz) to authenticated, service_role;

create or replace function public.admin_record_tournament_match_result(
  p_match_id uuid,
  p_winner_player_id uuid,
  p_score_label text,
  p_evidence_reference text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_loser uuid;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode = '42501'; end if;
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'Match was not found'; end if;
  if v_match.status = 'completed' then
    if exists (select 1 from public.tournament_match_results where match_id = p_match_id and idempotency_key = p_idempotency_key and winner_player_id = p_winner_player_id) then return jsonb_build_object('status','already_recorded','match_id',p_match_id); end if;
    raise exception 'A result already exists for this match';
  end if;
  if p_winner_player_id <> v_match.player_a_id and p_winner_player_id <> v_match.player_b_id then raise exception 'Winner must be a current match participant'; end if;
  v_loser := case when p_winner_player_id = v_match.player_a_id then v_match.player_b_id else v_match.player_a_id end;
  insert into public.tournament_match_results(match_id, winner_player_id, loser_player_id, score_label, evidence_reference, verified_by, idempotency_key) values (p_match_id, p_winner_player_id, v_loser, btrim(p_score_label), btrim(p_evidence_reference), auth.uid(), btrim(p_idempotency_key));
  update public.tournament_matches set winner_player_id = p_winner_player_id, loser_player_id = v_loser, status = 'completed', updated_at = now() where id = p_match_id;
  update public.tournament_matches as next_match set player_a_id = case when next_match.slot_a ->> 'match_key' = v_match.stable_key then p_winner_player_id else next_match.player_a_id end, player_b_id = case when next_match.slot_b ->> 'match_key' = v_match.stable_key then p_winner_player_id else next_match.player_b_id end, updated_at = now() where tournament_id = v_match.tournament_id and ((next_match.slot_a ->> 'match_key') = v_match.stable_key or (next_match.slot_b ->> 'match_key') = v_match.stable_key);
  insert into public.tournament_audit_log(tournament_id, action, details, actor_id) values (v_match.tournament_id, 'match_result_recorded', jsonb_build_object('match_id',p_match_id,'winner_player_id',p_winner_player_id), auth.uid());
  return jsonb_build_object('status','recorded','match_id',p_match_id,'winner_player_id',p_winner_player_id,'loser_player_id',v_loser);
end;
$$;

revoke all on function public.admin_record_tournament_match_result(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.admin_record_tournament_match_result(uuid, uuid, text, text, text) to authenticated, service_role;

create or replace function public.admin_force_tournament_advance(
  p_tournament_id uuid,
  p_match_id uuid,
  p_advancing_player_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_loser uuid;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode = '42501'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'A written forced-advance reason is required'; end if;
  select * into v_match from public.tournament_matches where id = p_match_id and tournament_id = p_tournament_id for update;
  if not found then raise exception 'Match was not found'; end if;
  if v_match.status = 'completed' then raise exception 'Completed matches cannot be forced forward'; end if;
  if p_advancing_player_id <> v_match.player_a_id and p_advancing_player_id <> v_match.player_b_id then raise exception 'The advancing player must be in the match'; end if;
  v_loser := case when p_advancing_player_id = v_match.player_a_id then v_match.player_b_id else v_match.player_a_id end;
  insert into public.tournament_forced_advancements(match_id, advancing_player_id, reason, decided_by)
  values (p_match_id, p_advancing_player_id, btrim(p_reason), auth.uid());
  update public.tournament_matches
  set winner_player_id = p_advancing_player_id, loser_player_id = v_loser, status = 'completed', updated_at = now()
  where id = p_match_id;
  update public.tournament_matches as next_match
  set player_a_id = case when next_match.slot_a ->> 'match_key' = v_match.stable_key then p_advancing_player_id else next_match.player_a_id end,
      player_b_id = case when next_match.slot_b ->> 'match_key' = v_match.stable_key then p_advancing_player_id else next_match.player_b_id end,
      updated_at = now()
  where tournament_id = v_match.tournament_id
    and ((next_match.slot_a ->> 'match_key') = v_match.stable_key or (next_match.slot_b ->> 'match_key') = v_match.stable_key);
  insert into public.tournament_audit_log(tournament_id, action, details, actor_id)
  values (p_tournament_id, 'forced_advance_applied', jsonb_build_object('match_id', p_match_id, 'advancing_player_id', p_advancing_player_id, 'reason', btrim(p_reason)), auth.uid());
  return jsonb_build_object('status', 'completed', 'match_id', p_match_id, 'winner_player_id', p_advancing_player_id, 'loser_player_id', v_loser);
end;
$$;

revoke all on function public.admin_force_tournament_advance(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.admin_force_tournament_advance(uuid, uuid, uuid, text) to authenticated, service_role;

create or replace function public.admin_update_tournament_control(
  p_tournament_id uuid,
  p_action text,
  p_status text,
  p_schedule_preset text,
  p_schedule_timezone text,
  p_start_at timestamptz,
  p_overall_deadline_at timestamptz,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament public.tournaments%rowtype;
  v_old_deadline timestamptz;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode = '42501'; end if;
  select * into v_tournament from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'Tournament was not found'; end if;
  if p_action = 'set_status' then
    if p_status not in ('draft', 'registration_open', 'registration_closed', 'live', 'completed', 'archived', 'cancelled') then raise exception 'Invalid tournament status'; end if;
    if not ((v_tournament.status = 'draft' and p_status in ('draft', 'registration_open', 'cancelled')) or (v_tournament.status = 'registration_open' and p_status in ('registration_open', 'registration_closed', 'cancelled')) or (v_tournament.status = 'registration_closed' and p_status in ('registration_closed', 'live', 'cancelled')) or (v_tournament.status = 'live' and p_status in ('live', 'completed', 'cancelled')) or (v_tournament.status = 'completed' and p_status in ('completed', 'archived')) or (v_tournament.status = 'cancelled' and p_status = 'cancelled')) then raise exception 'Unsafe tournament lifecycle transition'; end if;
    update public.tournaments set status = p_status, registration_open_at = case when p_status = 'registration_open' then coalesce(registration_open_at, now()) else registration_open_at end, registration_closed_at = case when p_status = 'registration_closed' then coalesce(registration_closed_at, now()) else registration_closed_at end, started_at = case when p_status = 'live' then coalesce(started_at, now()) else started_at end, completed_at = case when p_status = 'completed' then coalesce(completed_at, now()) else completed_at end, version = version + 1, updated_at = now() where id = p_tournament_id;
  elsif p_action = 'update_schedule' then
    if p_schedule_preset not in ('NORMAL', 'ONE_DAY', 'CUSTOM') then raise exception 'Invalid schedule preset'; end if;
    if not exists (select 1 from pg_catalog.pg_timezone_names where name = btrim(p_schedule_timezone)) then raise exception 'A valid IANA schedule time zone is required'; end if;
    if v_tournament.status = 'live' and (p_overall_deadline_at is null or p_overall_deadline_at <= coalesce(v_tournament.overall_deadline_at, now())) then raise exception 'Live tournaments may only receive a later deadline extension'; end if;
    if v_tournament.status = 'live' and btrim(coalesce(p_reason, '')) = '' then raise exception 'A written reason is required for a live deadline change'; end if;
    v_old_deadline := v_tournament.overall_deadline_at;
    update public.tournaments set schedule_preset = p_schedule_preset, schedule_timezone = btrim(p_schedule_timezone), start_at = p_start_at, overall_deadline_at = p_overall_deadline_at, version = version + 1, updated_at = now() where id = p_tournament_id;
    if v_tournament.status = 'live' and p_overall_deadline_at is not null then
      insert into public.tournament_deadline_changes(tournament_id, scope, old_deadline_at, new_deadline_at, schedule_timezone, reason, changed_by) values (p_tournament_id, 'tournament', v_old_deadline, p_overall_deadline_at, btrim(p_schedule_timezone), btrim(p_reason), auth.uid());
    end if;
  elsif p_action = 'extend_deadline' then
    if v_tournament.status <> 'live' then raise exception 'Deadline extensions require a live tournament'; end if;
    if p_overall_deadline_at is null or p_overall_deadline_at <= coalesce(v_tournament.overall_deadline_at, now()) then raise exception 'The new deadline must be later than the current deadline'; end if;
    if btrim(coalesce(p_reason, '')) = '' then raise exception 'A written reason is required for a live deadline change'; end if;
    if not exists (select 1 from pg_catalog.pg_timezone_names where name = btrim(coalesce(p_schedule_timezone, v_tournament.schedule_timezone))) then raise exception 'A valid IANA schedule time zone is required'; end if;
    update public.tournaments set overall_deadline_at = p_overall_deadline_at, version = version + 1, updated_at = now() where id = p_tournament_id;
    insert into public.tournament_deadline_changes(tournament_id, scope, old_deadline_at, new_deadline_at, schedule_timezone, reason, changed_by) values (p_tournament_id, 'tournament', v_tournament.overall_deadline_at, p_overall_deadline_at, btrim(coalesce(p_schedule_timezone, v_tournament.schedule_timezone)), btrim(p_reason), auth.uid());
  else
    raise exception 'Unsupported tournament control action';
  end if;
  insert into public.tournament_audit_log(tournament_id, action, details, actor_id) values (p_tournament_id, 'tournament_control_changed', jsonb_build_object('control_action', p_action, 'status', p_status, 'schedule_preset', p_schedule_preset, 'schedule_timezone', p_schedule_timezone, 'start_at', p_start_at, 'overall_deadline_at', p_overall_deadline_at, 'reason', p_reason), auth.uid());
  return jsonb_build_object('status', 'updated', 'tournament_id', p_tournament_id, 'action', p_action);
end;
$$;

revoke all on function public.admin_update_tournament_control(uuid, text, text, text, text, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.admin_update_tournament_control(uuid, text, text, text, text, timestamptz, timestamptz, text) to authenticated, service_role;

create or replace function public.player_match_schedule_action(
  p_match_id uuid,
  p_action text,
  p_offer_id uuid,
  p_starts_at timestamptz,
  p_proposed_timezone text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_discord_id text;
  v_player_id uuid;
  v_match public.tournament_matches%rowtype;
  v_offer public.tournament_match_schedule_offers%rowtype;
begin
  if auth.uid() is null then raise exception 'Authenticated Discord player is required' using errcode = '42501'; end if;
  select coalesce(identity_data ->> 'provider_id', identity_data ->> 'id', identity_data ->> 'sub') into v_discord_id
  from auth.identities where user_id = auth.uid() and provider = 'discord' limit 1;
  if v_discord_id is null then raise exception 'Authenticated Discord player is required' using errcode = '42501'; end if;
  if p_action not in ('propose', 'accept', 'counter', 'withdraw') then raise exception 'Unsupported schedule action'; end if;
  select public.resolve_canonical_player_id(player.id) into v_player_id from public.players as player where nullif(btrim(player.discord_id), '') = v_discord_id and player.active = true limit 1;
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found or v_player_id not in (v_match.player_a_id, v_match.player_b_id) then raise exception 'You are not a participant in this match' using errcode = '42501'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = btrim(coalesce(p_proposed_timezone, ''))) then raise exception 'A valid IANA time zone is required'; end if;
  if p_action = 'propose' then
    if p_starts_at is null or p_starts_at <= now() then raise exception 'The proposed time must be in the future'; end if;
    insert into public.tournament_match_schedule_offers(match_id, proposed_by, starts_at, proposed_timezone, idempotency_key) values (p_match_id, v_player_id, p_starts_at, btrim(p_proposed_timezone), btrim(p_idempotency_key)) returning * into v_offer;
  else
    select * into v_offer from public.tournament_match_schedule_offers where id = p_offer_id and match_id = p_match_id for update;
    if not found or v_offer.proposed_by = v_player_id then raise exception 'The schedule offer is invalid for this response'; end if;
    update public.tournament_match_schedule_offers set status = case p_action when 'accept' then 'accepted' when 'counter' then 'countered' else 'withdrawn' end, responded_at = now() where id = p_offer_id returning * into v_offer;
    if p_action = 'counter' then
      if p_starts_at is null or p_starts_at <= now() then raise exception 'A counter time must be in the future'; end if;
      insert into public.tournament_match_schedule_offers(match_id, proposed_by, starts_at, proposed_timezone, idempotency_key) values (p_match_id, v_player_id, p_starts_at, btrim(p_proposed_timezone), btrim(p_idempotency_key)) returning * into v_offer;
    end if;
    if p_action = 'accept' then update public.tournament_matches set scheduled_at = v_offer.starts_at, match_timezone = v_offer.proposed_timezone, updated_at = now() where id = p_match_id; end if;
  end if;
  return jsonb_build_object('status', v_offer.status, 'offer_id', v_offer.id, 'starts_at', v_offer.starts_at, 'time_zone', v_offer.proposed_timezone);
end;
$$;

revoke all on function public.player_match_schedule_action(uuid, text, uuid, timestamptz, text, text) from public, anon;
grant execute on function public.player_match_schedule_action(uuid, text, uuid, timestamptz, text, text) to authenticated, service_role;

create or replace function public.confirm_tournament_winner(p_match_id uuid, p_selected_winner_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_discord_id text;
  v_player_id uuid;
  v_match public.tournament_matches%rowtype;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Authenticated Discord player is required' using errcode = '42501'; end if;
  select coalesce(identity_data ->> 'provider_id', identity_data ->> 'id', identity_data ->> 'sub') into v_discord_id
  from auth.identities where user_id = auth.uid() and provider = 'discord' limit 1;
  if v_discord_id is null then raise exception 'Authenticated Discord player is required' using errcode = '42501'; end if;
  select public.resolve_canonical_player_id(player.id) into v_player_id from public.players as player where nullif(btrim(player.discord_id), '') = v_discord_id and player.active = true limit 1;
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found or v_player_id not in (v_match.player_a_id, v_match.player_b_id) or p_selected_winner_id not in (v_match.player_a_id, v_match.player_b_id) then raise exception 'Winner confirmation is not valid for this match' using errcode = '42501'; end if;
  if v_match.status = 'completed' then raise exception 'This match is already completed'; end if;
  insert into public.tournament_winner_confirmations(match_id, player_id, selected_winner_id) values (p_match_id, v_player_id, p_selected_winner_id) on conflict (match_id, player_id) do update set selected_winner_id = excluded.selected_winner_id, created_at = now();
  select count(*) into v_count from public.tournament_winner_confirmations where match_id = p_match_id;
  if v_count = 2 and (select count(distinct selected_winner_id) from public.tournament_winner_confirmations where match_id = p_match_id) = 1 then
    update public.tournament_matches set winner_player_id = p_selected_winner_id, loser_player_id = case when p_selected_winner_id = player_a_id then player_b_id else player_a_id end, status = 'completed', updated_at = now() where id = p_match_id;
    update public.tournament_matches as next_match set player_a_id = case when next_match.slot_a ->> 'match_key' = v_match.stable_key then p_selected_winner_id else next_match.player_a_id end, player_b_id = case when next_match.slot_b ->> 'match_key' = v_match.stable_key then p_selected_winner_id else next_match.player_b_id end, updated_at = now() where tournament_id = v_match.tournament_id and ((next_match.slot_a ->> 'match_key') = v_match.stable_key or (next_match.slot_b ->> 'match_key') = v_match.stable_key);
    return jsonb_build_object('status','completed','winner_player_id',p_selected_winner_id);
  elsif v_count = 2 then
    update public.tournament_matches set status = 'review', updated_at = now() where id = p_match_id;
    return jsonb_build_object('status','review');
  end if;
  return jsonb_build_object('status','awaiting_other_confirmation');
end;
$$;

revoke all on function public.confirm_tournament_winner(uuid, uuid) from public, anon;
grant execute on function public.confirm_tournament_winner(uuid, uuid) to authenticated, service_role;

create or replace function public.request_tournament_forfeit(p_match_id uuid, p_explanation text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_discord_id text;
  v_player_id uuid;
  v_match public.tournament_matches%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authenticated Discord player is required' using errcode = '42501'; end if;
  select coalesce(identity_data ->> 'provider_id', identity_data ->> 'id', identity_data ->> 'sub') into v_discord_id
  from auth.identities where user_id = auth.uid() and provider = 'discord' limit 1;
  if v_discord_id is null then raise exception 'Authenticated Discord player is required' using errcode = '42501'; end if;
  if btrim(coalesce(p_explanation, '')) = '' then raise exception 'A written forfeit explanation is required'; end if;
  select public.resolve_canonical_player_id(player.id) into v_player_id from public.players as player where nullif(btrim(player.discord_id), '') = v_discord_id and player.active = true limit 1;
  select * into v_match from public.tournament_matches where id = p_match_id;
  if not found or v_player_id not in (v_match.player_a_id, v_match.player_b_id) then raise exception 'You are not a participant in this match' using errcode = '42501'; end if;
  insert into public.tournament_forfeit_requests(match_id, requested_by, explanation) values (p_match_id, v_player_id, btrim(p_explanation)) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.request_tournament_forfeit(uuid, text) from public, anon;
grant execute on function public.request_tournament_forfeit(uuid, text) to authenticated, service_role;

create or replace function public.admin_record_tournament_rewind(p_tournament_id uuid, p_match_id uuid, p_reason text, p_affected_match_ids jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode = '42501'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'A written rewind reason is required'; end if;
  insert into public.tournament_rewinds(tournament_id, match_id, reason, affected_match_ids, rewound_by) values (p_tournament_id, p_match_id, btrim(p_reason), coalesce(p_affected_match_ids, '[]'::jsonb), auth.uid()) returning id into v_id;
  insert into public.tournament_audit_log(tournament_id, action, details, actor_id) values (p_tournament_id, 'rewind_requested', jsonb_build_object('match_id',p_match_id,'affected_match_ids',coalesce(p_affected_match_ids,'[]'::jsonb),'reason',p_reason), auth.uid());
  return v_id;
end;
$$;

revoke all on function public.admin_record_tournament_rewind(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.admin_record_tournament_rewind(uuid, uuid, text, jsonb) to authenticated, service_role;

create or replace function public.admin_record_secret_par_access(p_tournament_id uuid, p_designated_admin uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_player_id uuid; v_id uuid;
begin
  if not public.is_current_user_site_admin() or p_designated_admin <> auth.uid() then raise exception 'Only the selected top administrator may view secret pars' using errcode = '42501'; end if;
  select public.resolve_canonical_player_id(player.id) into v_player_id from public.players as player where nullif(btrim(player.discord_id), '') = (select coalesce(identity_data ->> 'provider_id', identity_data ->> 'id', identity_data ->> 'sub') from auth.identities where user_id = auth.uid() and provider = 'discord' limit 1) and player.active = true limit 1;
  if exists (select 1 from public.tournament_registrations where tournament_id = p_tournament_id and player_id = v_player_id and status = 'confirmed') then raise exception 'A secret-par viewer may not participate in the tournament' using errcode = '42501'; end if;
  insert into public.tournament_secret_par_access(tournament_id, designated_admin, viewed_by) values (p_tournament_id, p_designated_admin, auth.uid()) on conflict (tournament_id, viewed_by) do nothing returning id into v_id;
  return coalesce(v_id, (select id from public.tournament_secret_par_access where tournament_id = p_tournament_id and viewed_by = auth.uid()));
end;
$$;

revoke all on function public.admin_record_secret_par_access(uuid, uuid) from public, anon;
grant execute on function public.admin_record_secret_par_access(uuid, uuid) to authenticated, service_role;

create or replace function public.prevent_tournament_append_only_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Tournament audit and verified result records are append-only';
end;
$$;

drop trigger if exists tournament_match_results_append_only on public.tournament_match_results;
create trigger tournament_match_results_append_only before update or delete on public.tournament_match_results for each row execute function public.prevent_tournament_append_only_mutation();
drop trigger if exists tournament_rule_changes_append_only on public.tournament_rule_changes;
create trigger tournament_rule_changes_append_only before update or delete on public.tournament_rule_changes for each row execute function public.prevent_tournament_append_only_mutation();
drop trigger if exists tournament_audit_log_append_only on public.tournament_audit_log;
create trigger tournament_audit_log_append_only before update or delete on public.tournament_audit_log for each row execute function public.prevent_tournament_append_only_mutation();
revoke all on function public.prevent_tournament_append_only_mutation() from public, anon, authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('tournament-artwork', 'tournament-artwork', false, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('tournament-scorecards', 'tournament-scorecards', false, 12582912, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('tournament-trophies', 'tournament-trophies', false, 12582912, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

commit;
