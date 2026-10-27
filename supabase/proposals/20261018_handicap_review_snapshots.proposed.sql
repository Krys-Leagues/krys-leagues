-- PROPOSAL ONLY — NOT A MIGRATION.
-- Phase 43 local review contract. Do not execute against Production.
-- No public/anon/authenticated policies are created. Future admin readers must
-- use an already-reviewed server-side authorization path.
--
-- Phase 44 review notes:
-- * CREATE TABLE IF NOT EXISTS is not a compatibility check. Before any future
--   installation, compare pg_catalog definitions and stop on a mismatch.
-- * Snapshot, evidence, decision, and provenance rows are append-only. The
--   trigger contract below rejects UPDATE/DELETE; calculation runs remain
--   mutable only for lifecycle status/completion metadata.
-- * This file remains a proposal and has not been applied anywhere.

begin;

create table if not exists public.handicap_calculation_runs (
  id uuid primary key default gen_random_uuid(),
  policy_version text not null,
  model_version text not null,
  source_package_ref text not null,
  chronology_policy text not null,
  status text not null check (status in ('DRAFT', 'COMPLETED', 'FAILED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.handicap_rating_snapshots (
  id uuid primary key default gen_random_uuid(),
  calculation_run_id uuid not null references public.handicap_calculation_runs(id),
  course_id text not null,
  difficulty text not null check (difficulty in ('easy', 'hard')),
  course_rating numeric,
  slope numeric,
  sample_size integer not null check (sample_size >= 0),
  distinct_canonical_player_count integer not null check (distinct_canonical_player_count >= 0),
  rating_confidence text not null check (rating_confidence in ('ready', 'provisional', 'needs_data', 'needs_review')),
  model_version text not null,
  effective_from date,
  effective_period text,
  source_evidence_refs text[] not null default '{}',
  publication_status text not null check (publication_status in ('DRAFT', 'PROVISIONAL', 'UNPUBLISHED')),
  created_at timestamptz not null default now(),
  unique (calculation_run_id, course_id, difficulty, model_version)
);

create table if not exists public.handicap_index_snapshots (
  id uuid primary key default gen_random_uuid(),
  calculation_run_id uuid not null references public.handicap_calculation_runs(id),
  canonical_player_id uuid not null references public.players(id),
  source_round_ids text[] not null default '{}',
  rating_snapshot_ids uuid[] not null default '{}',
  rating_version_ids text[] not null default '{}',
  differential_model_version text not null,
  latest_ten_source_round_ids text[] not null default '{}',
  best_five_source_round_ids text[] not null default '{}',
  resulting_index numeric,
  chronology_confidence text not null check (chronology_confidence in ('EXACT', 'PERIOD_WINDOW', 'ORDERED_UNDATED', 'UNKNOWN', 'AMBIGUOUS')),
  publication_status text not null check (publication_status in ('DRAFT', 'PROVISIONAL', 'UNPUBLISHED')),
  created_at timestamptz not null default now(),
  unique (calculation_run_id, canonical_player_id, differential_model_version)
);

create table if not exists public.handicap_review_evidence (
  id uuid primary key default gen_random_uuid(),
  subject_kind text not null,
  subject_key text not null,
  source_ref text not null,
  evidence_payload jsonb not null default '{}'::jsonb,
  check (subject_kind in ('PLAYER_IDENTITY', 'COURSE_ALIAS', 'DUPLICATE_CANDIDATE', 'SOURCE_RECORD')),
  created_at timestamptz not null default now(),
  unique (subject_kind, subject_key, source_ref)
);

create table if not exists public.handicap_review_decisions (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid references public.handicap_review_evidence(id),
  subject_kind text not null,
  subject_key text not null,
  decision text not null check (decision in ('ACCEPT', 'QUARANTINE', 'REJECT_WITH_EVIDENCE', 'NEEDS_MORE_INFORMATION')),
  rationale text not null,
  reviewer_id uuid references public.players(id),
  decision_sequence integer not null check (decision_sequence > 0),
  created_at timestamptz not null default now(),
  unique (subject_kind, subject_key, decision_sequence)
);

create table if not exists public.handicap_source_provenance (
  id uuid primary key default gen_random_uuid(),
  source_fingerprint text not null unique,
  source_type text not null,
  source_ref text not null,
  source_date date,
  source_season integer,
  source_week integer,
  original_player_name text,
  canonical_player_id uuid references public.players(id),
  original_course_label text,
  original_course_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create schema if not exists handicap_private;
revoke all on schema handicap_private from public, anon, authenticated;

-- This function is deliberately private and has no client EXECUTE grant. The
-- preflight must reject an existing same-signature function whose definition is
-- not the approved append-only guard; do not use CREATE OR REPLACE here.
do $$
declare
  existing_definition text;
begin
  select pg_get_functiondef(p.oid)
  into existing_definition
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'handicap_private'
    and p.proname = 'reject_history_mutation'
    and p.pronargs = 0;

  if existing_definition is not null
     and existing_definition not like '%Handicap history is append-only%' then
    raise exception 'handicap_private.reject_history_mutation() exists with an incompatible definition';
  end if;

  if existing_definition is null then
    execute $fn$
      create function handicap_private.reject_history_mutation()
      returns trigger
      language plpgsql
      security definer
      set search_path = pg_catalog
      as $body$
      begin
        raise exception 'Handicap history is append-only' using errcode = '55000';
      end;
      $body$
    $fn$;
  end if;
end
$$;

revoke all on function handicap_private.reject_history_mutation() from public, anon, authenticated;

do $$
declare
  table_name text;
  trigger_name text;
  trigger_definition text;
begin
  foreach table_name in array array[
    'handicap_rating_snapshots',
    'handicap_index_snapshots',
    'handicap_review_evidence',
    'handicap_review_decisions',
    'handicap_source_provenance'
  ] loop
    trigger_name := 'handicap_' || table_name || '_append_only';
    select pg_get_triggerdef(t.oid, true)
    into trigger_definition
    from pg_trigger as t
    where t.tgrelid = format('public.%I', table_name)::regclass
      and t.tgname = trigger_name
      and not t.tgisinternal;

    if trigger_definition is not null
       and trigger_definition not like '%handicap_private.reject_history_mutation%' then
      raise exception 'Existing % trigger has an incompatible definition', trigger_name;
    elsif trigger_definition is null then
      execute format(
        'create trigger %I before update or delete on public.%I for each row execute function handicap_private.reject_history_mutation()',
        trigger_name,
        table_name
      );
    end if;
  end loop;
end
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'handicap_calculation_runs',
    'handicap_rating_snapshots',
    'handicap_index_snapshots',
    'handicap_review_evidence',
    'handicap_review_decisions',
    'handicap_source_provenance'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
  end loop;
end
$$;

grant select, insert, update on table public.handicap_calculation_runs to service_role;
grant select, insert on table public.handicap_rating_snapshots to service_role;
grant select, insert on table public.handicap_index_snapshots to service_role;
grant select, insert on table public.handicap_review_evidence to service_role;
grant select, insert on table public.handicap_review_decisions to service_role;
grant select, insert on table public.handicap_source_provenance to service_role;

revoke update, delete, truncate on table public.handicap_rating_snapshots from service_role;
revoke update, delete, truncate on table public.handicap_index_snapshots from service_role;
revoke update, delete, truncate on table public.handicap_review_evidence from service_role;
revoke update, delete, truncate on table public.handicap_review_decisions from service_role;
revoke update, delete, truncate on table public.handicap_source_provenance from service_role;

commit;
