begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'shared-scorecard-evidence',
  'shared-scorecard-evidence',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.shared_scorecard_contexts (
  id uuid primary key default gen_random_uuid(),
  adapter_key text not null check (adapter_key ~ '^[a-z][a-z0-9_]{1,39}$'),
  source_type text not null check (source_type in ('fixture', 'event_round', 'record_observation', 'manual_review')),
  source_key text not null check (length(trim(source_key)) between 1 and 200),
  season_id uuid references public.seasons(id) on delete restrict,
  season_number integer,
  competition_id uuid,
  competition_label text,
  division_number integer check (division_number is null or division_number between 1 and 99),
  division_label text,
  game_number integer check (game_number is null or game_number > 0),
  round_key text,
  round_label text,
  arranged_played_date date,
  event_played_date date,
  course_id uuid not null references public.all_time_courses(id) on delete restrict,
  course_code text not null,
  course_name_snapshot text not null,
  difficulty text not null check (difficulty in ('Easy', 'Hard')),
  par_snapshot smallint[] not null check (array_length(par_snapshot, 1) = 18),
  total_par smallint not null check (total_par > 0),
  context_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(context_metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (adapter_key, source_type, source_key)
);

create table if not exists public.shared_scorecard_participants (
  id uuid primary key default gen_random_uuid(),
  context_id uuid not null references public.shared_scorecard_contexts(id) on delete restrict,
  role_key text not null check (role_key ~ '^[a-z][a-z0-9_]{0,39}$'),
  subject_type text not null check (subject_type in ('player', 'team')),
  player_id uuid references public.players(id) on delete restrict,
  team_id uuid references public.doubles_teams(id) on delete restrict,
  display_name_snapshot text not null,
  participant_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(participant_metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (context_id, role_key),
  check (
    (subject_type = 'player' and player_id is not null and team_id is null)
    or (subject_type = 'team' and team_id is not null and player_id is null)
  )
);

create table if not exists public.shared_scorecard_evidence (
  id uuid primary key default gen_random_uuid(),
  context_id uuid not null references public.shared_scorecard_contexts(id) on delete restrict,
  submitted_by_player_id uuid references public.players(id) on delete restrict,
  submitted_by_discord_user_id text check (
    submitted_by_discord_user_id is null or submitted_by_discord_user_id ~ '^[0-9]+$'
  ),
  submission_source text not null check (submission_source in ('discord_player', 'admin', 'website_player', 'historical_source')),
  storage_bucket text not null default 'shared-scorecard-evidence' check (storage_bucket = 'shared-scorecard-evidence'),
  storage_path text not null unique,
  original_filename text not null,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  file_size_bytes integer not null check (file_size_bytes between 1 and 10485760),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  review_status text not null default 'submitted' check (
    review_status in ('uploading', 'submitted', 'under_review', 'verified', 'replaced', 'upload_failed')
  ),
  retention_policy text,
  retention_eligible_at timestamptz,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    submission_source <> 'discord_player'
    or (submitted_by_player_id is not null and submitted_by_discord_user_id is not null)
  )
);

create unique index if not exists shared_scorecard_one_active_evidence
  on public.shared_scorecard_evidence (context_id)
  where review_status in ('uploading', 'submitted', 'under_review', 'verified');

create index if not exists shared_scorecard_evidence_review_queue
  on public.shared_scorecard_evidence (review_status, submitted_at, context_id);

create table if not exists public.shared_scorecards (
  id uuid primary key default gen_random_uuid(),
  context_id uuid not null references public.shared_scorecard_contexts(id) on delete restrict,
  participant_id uuid not null references public.shared_scorecard_participants(id) on delete restrict,
  evidence_id uuid references public.shared_scorecard_evidence(id) on delete restrict,
  component_key text not null default 'primary' check (component_key ~ '^[a-z][a-z0-9_]{0,39}$'),
  review_status text not null default 'draft' check (
    review_status in ('draft', 'submitted', 'under_review', 'verified_pending_commit', 'verified', 'reopened')
  ),
  played_date date not null,
  played_date_source text not null check (played_date_source in ('arranged_game', 'event_round', 'admin_selected')),
  card_date_text text,
  total_strokes integer not null check (total_strokes between 18 and 1782),
  total_par integer not null check (total_par > 0),
  score_to_par integer not null,
  league_result jsonb not null default '{}'::jsonb check (jsonb_typeof(league_result) = 'object'),
  verification_revision integer not null default 1 check (verification_revision > 0),
  submitted_at timestamptz,
  verified_at timestamptz,
  verified_by_auth_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (context_id, participant_id, component_key)
);

create table if not exists public.shared_scorecard_holes (
  card_id uuid not null references public.shared_scorecards(id) on delete cascade,
  hole_number smallint not null check (hole_number between 1 and 18),
  par smallint not null check (par between 1 and 20),
  strokes smallint not null check (strokes between 1 and 99),
  score_to_par smallint generated always as (strokes - par) stored,
  hole_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(hole_metadata) = 'object'),
  primary key (card_id, hole_number)
);

create table if not exists public.shared_scorecard_revisions (
  id bigint generated by default as identity primary key,
  card_id uuid not null references public.shared_scorecards(id) on delete restrict,
  revision_number integer not null check (revision_number > 0),
  previous_snapshot jsonb,
  new_snapshot jsonb not null,
  changed_by_auth_user_id uuid not null,
  change_reason text,
  changed_at timestamptz not null default now(),
  unique (card_id, revision_number)
);

create table if not exists public.shared_scorecard_adapter_commits (
  id uuid primary key default gen_random_uuid(),
  context_id uuid not null references public.shared_scorecard_contexts(id) on delete restrict,
  adapter_key text not null,
  card_ids uuid[] not null check (card_ids <> '{}'::uuid[] and array_position(card_ids, null) is null),
  commit_state text not null default 'pending' check (commit_state in ('pending', 'succeeded', 'failed')),
  idempotency_key text not null unique,
  result_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(result_payload) = 'object'),
  error_message text,
  requested_by_auth_user_id uuid not null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists shared_scorecard_one_pending_adapter_commit
  on public.shared_scorecard_adapter_commits (context_id)
  where commit_state = 'pending';

alter table public.shared_scorecard_contexts enable row level security;
alter table public.shared_scorecard_contexts force row level security;
alter table public.shared_scorecard_participants enable row level security;
alter table public.shared_scorecard_participants force row level security;
alter table public.shared_scorecard_evidence enable row level security;
alter table public.shared_scorecard_evidence force row level security;
alter table public.shared_scorecards enable row level security;
alter table public.shared_scorecards force row level security;
alter table public.shared_scorecard_holes enable row level security;
alter table public.shared_scorecard_holes force row level security;
alter table public.shared_scorecard_revisions enable row level security;
alter table public.shared_scorecard_revisions force row level security;
alter table public.shared_scorecard_adapter_commits enable row level security;
alter table public.shared_scorecard_adapter_commits force row level security;

revoke all on table public.shared_scorecard_contexts from public, anon, authenticated;
revoke all on table public.shared_scorecard_participants from public, anon, authenticated;
revoke all on table public.shared_scorecard_evidence from public, anon, authenticated;
revoke all on table public.shared_scorecards from public, anon, authenticated;
revoke all on table public.shared_scorecard_holes from public, anon, authenticated;
revoke all on table public.shared_scorecard_revisions from public, anon, authenticated;
revoke all on table public.shared_scorecard_adapter_commits from public, anon, authenticated;

grant select, insert, update on table public.shared_scorecard_contexts to service_role;
grant select, insert, update on table public.shared_scorecard_participants to service_role;
grant select, insert, update on table public.shared_scorecard_evidence to service_role;
grant select, insert, update on table public.shared_scorecards to service_role;
grant select, insert, update, delete on table public.shared_scorecard_holes to service_role;
grant select, insert on table public.shared_scorecard_revisions to service_role;
grant select, insert, update on table public.shared_scorecard_adapter_commits to service_role;
grant usage, select on sequence public.shared_scorecard_revisions_id_seq to service_role;

create or replace function public.save_shared_scorecard_draft_service(
  p_card_id uuid,
  p_context_id uuid,
  p_participant_id uuid,
  p_evidence_id uuid,
  p_component_key text,
  p_played_date date,
  p_played_date_source text,
  p_card_date_text text,
  p_holes jsonb,
  p_admin_auth_user_id uuid,
  p_change_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_context public.shared_scorecard_contexts%rowtype;
  v_card public.shared_scorecards%rowtype;
  v_card_id uuid := coalesce(p_card_id, gen_random_uuid());
  v_previous jsonb;
  v_new jsonb;
  v_total_strokes integer;
  v_total_par integer;
  v_revision integer;
begin
  if p_admin_auth_user_id is null then raise exception 'Reviewing admin is required'; end if;
  if p_component_key !~ '^[a-z][a-z0-9_]{0,39}$' then raise exception 'Invalid scorecard component'; end if;
  if jsonb_typeof(p_holes) <> 'array' or jsonb_array_length(p_holes) <> 18 then
    raise exception 'Exactly 18 holes are required';
  end if;

  select * into v_context from public.shared_scorecard_contexts where id = p_context_id for update;
  if v_context.id is null then raise exception 'Scorecard context not found'; end if;
  perform 1 from public.shared_scorecard_participants where id = p_participant_id and context_id = p_context_id;
  if not found then raise exception 'Participant does not belong to this scorecard context'; end if;
  if p_evidence_id is not null then
    perform 1 from public.shared_scorecard_evidence where id = p_evidence_id and context_id = p_context_id;
    if not found then raise exception 'Evidence does not belong to this scorecard context'; end if;
  end if;

  if v_context.arranged_played_date is not null then
    if p_played_date <> v_context.arranged_played_date or p_played_date_source <> 'arranged_game' then
      raise exception 'Played Date must come from the authoritative arranged game';
    end if;
  elsif v_context.event_played_date is not null then
    if p_played_date <> v_context.event_played_date or p_played_date_source <> 'event_round' then
      raise exception 'Played Date must come from the authoritative event round';
    end if;
  elsif p_played_date is null or p_played_date_source <> 'admin_selected' then
    raise exception 'Admin must select an unambiguous Played Date';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_holes) as hole(hole_number integer, par integer, strokes integer)
    where hole.hole_number not between 1 and 18
       or hole.par not between 1 and 20
       or hole.strokes not between 1 and 99
  ) then raise exception 'Every hole requires valid par and raw strokes'; end if;

  if (
    select count(distinct hole.hole_number)
    from jsonb_to_recordset(p_holes) as hole(hole_number integer, par integer, strokes integer)
  ) <> 18 then raise exception 'Hole numbers 1 through 18 are required exactly once'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_holes) as hole(hole_number integer, par integer, strokes integer)
    where hole.par <> v_context.par_snapshot[hole.hole_number]
  ) then raise exception 'Entered pars do not match the authoritative par snapshot'; end if;

  select sum(hole.strokes), sum(hole.par)
    into v_total_strokes, v_total_par
  from jsonb_to_recordset(p_holes) as hole(hole_number integer, par integer, strokes integer);
  if v_total_par <> v_context.total_par then
    raise exception 'Entered pars do not total the authoritative par snapshot';
  end if;

  select * into v_card
  from public.shared_scorecards
  where context_id = p_context_id
    and participant_id = p_participant_id
    and component_key = p_component_key
  for update;

  if v_card.id is not null then
    v_card_id := v_card.id;
    if v_card.review_status = 'verified' and nullif(trim(coalesce(p_change_reason, '')), '') is null then
      raise exception 'A correction reason is required for a verified scorecard';
    end if;
    select jsonb_build_object(
      'card', to_jsonb(v_card),
      'holes', coalesce(jsonb_agg(to_jsonb(hole_row) order by hole_row.hole_number), '[]'::jsonb)
    ) into v_previous
    from public.shared_scorecard_holes as hole_row
    where hole_row.card_id = v_card.id;
    v_revision := v_card.verification_revision + 1;
  else
    v_revision := 1;
  end if;

  insert into public.shared_scorecards (
    id, context_id, participant_id, evidence_id, component_key, review_status,
    played_date, played_date_source, card_date_text, total_strokes, total_par,
    score_to_par, verification_revision, submitted_at, updated_at
  ) values (
    v_card_id, p_context_id, p_participant_id, p_evidence_id, p_component_key, 'under_review',
    p_played_date, p_played_date_source, nullif(trim(p_card_date_text), ''), v_total_strokes,
    v_total_par, v_total_strokes - v_total_par, v_revision, now(), now()
  )
  on conflict (context_id, participant_id, component_key) do update
  set evidence_id = excluded.evidence_id,
      review_status = 'under_review',
      played_date = excluded.played_date,
      played_date_source = excluded.played_date_source,
      card_date_text = excluded.card_date_text,
      total_strokes = excluded.total_strokes,
      total_par = excluded.total_par,
      score_to_par = excluded.score_to_par,
      verification_revision = excluded.verification_revision,
      submitted_at = coalesce(public.shared_scorecards.submitted_at, now()),
      verified_at = null,
      verified_by_auth_user_id = null,
      updated_at = now()
  returning id into v_card_id;

  delete from public.shared_scorecard_holes where card_id = v_card_id;
  insert into public.shared_scorecard_holes (card_id, hole_number, par, strokes)
  select v_card_id, hole.hole_number, hole.par, hole.strokes
  from jsonb_to_recordset(p_holes) as hole(hole_number integer, par integer, strokes integer)
  order by hole.hole_number;

  select jsonb_build_object(
    'card', to_jsonb(card_row),
    'holes', coalesce(jsonb_agg(to_jsonb(hole_row) order by hole_row.hole_number), '[]'::jsonb)
  ) into v_new
  from public.shared_scorecards as card_row
  left join public.shared_scorecard_holes as hole_row on hole_row.card_id = card_row.id
  where card_row.id = v_card_id
  group by card_row.id;

  insert into public.shared_scorecard_revisions (
    card_id, revision_number, previous_snapshot, new_snapshot,
    changed_by_auth_user_id, change_reason
  ) values (
    v_card_id, v_revision, v_previous, v_new,
    p_admin_auth_user_id, nullif(trim(p_change_reason), '')
  );

  if p_evidence_id is not null then
    update public.shared_scorecard_evidence
    set review_status = 'under_review', updated_at = now()
    where id = p_evidence_id and review_status in ('submitted', 'under_review', 'verified');
  end if;
  return v_card_id;
end;
$function$;

revoke all on function public.save_shared_scorecard_draft_service(
  uuid, uuid, uuid, uuid, text, date, text, text, jsonb, uuid, text
) from public, anon, authenticated;
grant execute on function public.save_shared_scorecard_draft_service(
  uuid, uuid, uuid, uuid, text, date, text, text, jsonb, uuid, text
) to service_role;

create or replace function public.begin_shared_scorecard_verification_service(
  p_context_id uuid,
  p_card_ids uuid[],
  p_admin_auth_user_id uuid,
  p_change_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_context public.shared_scorecard_contexts%rowtype;
  v_commit_id uuid := gen_random_uuid();
  v_key text;
  v_existing_state text;
begin
  select * into v_context from public.shared_scorecard_contexts where id = p_context_id for update;
  if v_context.id is null or p_admin_auth_user_id is null then raise exception 'Verification context is invalid'; end if;
  if coalesce(array_length(p_card_ids, 1), 0) = 0 then raise exception 'At least one scorecard is required'; end if;
  if (
    select count(*) from public.shared_scorecards as card
    where card.id = any(p_card_ids)
      and card.context_id = p_context_id
      and card.review_status in ('under_review', 'reopened')
      and (select count(*) from public.shared_scorecard_holes as hole where hole.card_id = card.id) = 18
  ) <> array_length(p_card_ids, 1) then raise exception 'Every scorecard must contain 18 reviewed holes'; end if;

  v_key := md5(
    p_context_id::text || ':' || array_to_string(p_card_ids, ',') || ':' ||
    (select string_agg(card.verification_revision::text, ',' order by card.id)
     from public.shared_scorecards as card where card.id = any(p_card_ids))
  );

  select id, commit_state into v_commit_id, v_existing_state
  from public.shared_scorecard_adapter_commits
  where idempotency_key = v_key
  for update;
  if v_existing_state = 'succeeded' then return v_commit_id; end if;
  if v_existing_state = 'failed' then
    update public.shared_scorecard_adapter_commits
    set commit_state = 'pending', error_message = null, completed_at = null,
        requested_by_auth_user_id = p_admin_auth_user_id, updated_at = now()
    where id = v_commit_id;
  end if;

  if v_existing_state is null then
    v_commit_id := gen_random_uuid();
    insert into public.shared_scorecard_adapter_commits (
      id, context_id, adapter_key, card_ids, idempotency_key,
      requested_by_auth_user_id, result_payload
    ) values (
      v_commit_id, p_context_id, v_context.adapter_key, p_card_ids, v_key,
      p_admin_auth_user_id, jsonb_build_object('change_reason', nullif(trim(p_change_reason), ''))
    );
  end if;

  update public.shared_scorecards
  set review_status = 'verified_pending_commit', updated_at = now()
  where id = any(p_card_ids) and context_id = p_context_id;
  return v_commit_id;
end;
$function$;

revoke all on function public.begin_shared_scorecard_verification_service(uuid, uuid[], uuid, text)
  from public, anon, authenticated;
grant execute on function public.begin_shared_scorecard_verification_service(uuid, uuid[], uuid, text)
  to service_role;

create or replace function public.complete_shared_scorecard_verification_service(
  p_commit_id uuid,
  p_succeeded boolean,
  p_result_payload jsonb default '{}'::jsonb,
  p_error_message text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_commit public.shared_scorecard_adapter_commits%rowtype;
begin
  select * into v_commit
  from public.shared_scorecard_adapter_commits
  where id = p_commit_id and commit_state = 'pending'
  for update;
  if v_commit.id is null then return false; end if;

  update public.shared_scorecard_adapter_commits
  set commit_state = case when p_succeeded then 'succeeded' else 'failed' end,
      result_payload = coalesce(p_result_payload, '{}'::jsonb),
      error_message = case when p_succeeded then null else left(coalesce(p_error_message, 'Adapter commit failed'), 1000) end,
      completed_at = now(),
      updated_at = now()
  where id = p_commit_id;

  update public.shared_scorecards
  set review_status = case when p_succeeded then 'verified' else 'under_review' end,
      league_result = case when p_succeeded then coalesce(p_result_payload, '{}'::jsonb) else league_result end,
      verified_at = case when p_succeeded then now() else null end,
      verified_by_auth_user_id = case when p_succeeded then v_commit.requested_by_auth_user_id else null end,
      updated_at = now()
  where id = any(v_commit.card_ids);

  if p_succeeded then
    update public.shared_scorecard_evidence as evidence
    set review_status = 'verified', updated_at = now()
    where evidence.id in (
      select card.evidence_id from public.shared_scorecards as card where card.id = any(v_commit.card_ids)
    );
  end if;
  return true;
end;
$function$;

revoke all on function public.complete_shared_scorecard_verification_service(uuid, boolean, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.complete_shared_scorecard_verification_service(uuid, boolean, jsonb, text)
  to service_role;

create or replace function public.get_my_verified_scorecard_history_v1()
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_player_id uuid;
begin
  if v_auth_user_id is null then raise exception 'Authentication required'; end if;
  v_player_id := public.current_user_canonical_player_id();
  if v_player_id is null then raise exception 'Canonical player identity unavailable'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'league', context.adapter_key,
      'season_number', context.season_number,
      'competition', context.competition_label,
      'division', context.division_label,
      'game_number', context.game_number,
      'round', context.round_label,
      'course_code', context.course_code,
      'course', context.course_name_snapshot,
      'difficulty', context.difficulty,
      'played_date', card.played_date,
      'submitted_at', card.submitted_at,
      'verified_at', card.verified_at,
      'total_strokes', card.total_strokes,
      'score_to_par', card.score_to_par,
      'result', card.league_result,
      'holes', (
        select jsonb_agg(jsonb_build_object(
          'hole_number', hole.hole_number,
          'par', hole.par,
          'strokes', hole.strokes,
          'score_to_par', hole.score_to_par
        ) order by hole.hole_number)
        from public.shared_scorecard_holes as hole where hole.card_id = card.id
      )
    ) order by card.played_date desc, card.verified_at desc)
    from public.shared_scorecards as card
    join public.shared_scorecard_participants as participant on participant.id = card.participant_id
    join public.shared_scorecard_contexts as context on context.id = card.context_id
    where participant.player_id = v_player_id
      and card.review_status = 'verified'
  ), '[]'::jsonb);
end;
$function$;

revoke all on function public.get_my_verified_scorecard_history_v1()
  from public, anon, authenticated;
grant execute on function public.get_my_verified_scorecard_history_v1()
  to authenticated;

commit;
