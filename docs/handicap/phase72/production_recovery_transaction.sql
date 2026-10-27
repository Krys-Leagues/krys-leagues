-- PHASE 72 PREPARED-ONLY TRANSACTION.
-- NEVER EXECUTE WITHOUT A SEPARATE PRODUCTION APPROVAL AND A FRESH,
-- SUCCESSFUL RUN OF production_recovery_preflight.sql.
-- This file intentionally contains writes but was NOT executed in Phase 72.
-- It must be run only through an approved parameterized client workflow.
-- Never interpolate CSV values into SQL and never use server-side COPY.

-- Same-session staging setup. The approved client loader must create these
-- temporary tables and populate them with parameterized values before BEGIN.
-- Temporary tables are session-local and are not Production application data.
create temporary table phase72_run_stage (
  id uuid primary key,
  policy_version text not null,
  model_version text not null,
  source_package_ref text not null,
  chronology_policy text not null,
  status text not null,
  metadata jsonb not null
) on commit preserve rows;

create temporary table phase72_kwt_stage (
  id uuid primary key,
  source_fingerprint text not null,
  source_type text not null,
  source_ref text not null,
  source_date date,
  source_season integer,
  source_week integer,
  original_player_name text,
  canonical_player_id uuid,
  original_course_label text,
  original_course_code text,
  metadata jsonb not null
) on commit preserve rows;

create temporary table phase72_weekly_expected_stage (
  id uuid primary key,
  source_fingerprint text not null,
  source_type text not null,
  source_ref text not null,
  source_date date,
  source_season integer,
  source_week integer,
  original_player_name text,
  canonical_player_id uuid,
  original_course_label text,
  original_course_code text,
  metadata jsonb not null
) on commit preserve rows;

create temporary table phase72_snapshot_stage (
  id uuid primary key,
  calculation_run_id uuid not null,
  course_id text not null,
  difficulty text not null,
  course_rating numeric,
  slope numeric,
  sample_size integer not null,
  distinct_canonical_player_count integer not null,
  rating_confidence text not null,
  model_version text not null,
  effective_from date,
  effective_period text,
  source_evidence_refs text[] not null,
  publication_status text not null,
  review_scope text not null
) on commit preserve rows;

-- The approved loader must populate the four temp tables above using the
-- Phase 68 files and then begin this transaction in the same session.
begin;

set local lock_timeout = '5s';
select pg_advisory_xact_lock(hashtextextended('krys-handicap-phase72-recovery', 0));

do $$
declare
  old_run uuid := '5a57560c-3548-54a8-879c-8fc516a85f26';
  new_run uuid := 'fb606c55-e2f6-5d01-b79d-bfcc129a7cc6';
  expected_kwt constant integer := 13550;
  expected_weekly constant integer := 844;
  expected_snapshots constant integer := 169;
begin
  if not exists (
    select 1 from public.handicap_calculation_runs
    where id = old_run and status = 'DRAFT'
  ) then
    raise exception 'Phase 72 gate failed: invalid DRAFT run is not present';
  end if;

  if exists (select 1 from public.handicap_calculation_runs where id = new_run)
     or exists (select 1 from phase72_run_stage where id <> new_run)
     or (select count(*) from phase72_run_stage) <> 1 then
    raise exception 'Phase 72 gate failed: corrected run identity/stage conflict';
  end if;

  if (select count(*) from phase72_run_stage where id = new_run) <> 1
     or (select count(*) from phase72_run_stage where status = 'DRAFT') <> 1
     or (select count(*) from phase72_run_stage
         where source_package_ref = 'phase68-provenance-recovery-v1') <> 1 then
    raise exception 'Phase 72 gate failed: corrected run metadata mismatch';
  end if;

  if (select count(*) from phase72_kwt_stage) <> expected_kwt
     or (select count(distinct source_fingerprint) from phase72_kwt_stage)
          <> expected_kwt
     or exists (
       select 1 from phase72_kwt_stage
       where source_type <> 'KWT'
          or canonical_player_id is null
          or nullif(metadata->>'source_player_id', '') is null
          or source_fingerprint !~ '^KWT\|[^|]+\|[^|]+\|[^|]+\|[^|]+$'
     ) then
    raise exception 'Phase 72 gate failed: corrected KWT provenance invalid';
  end if;

  if exists (
    select 1
    from phase72_kwt_stage s
    join public.handicap_source_provenance p
      on p.source_fingerprint = s.source_fingerprint
  ) then
    raise exception 'Phase 72 gate failed: corrected KWT fingerprint already exists';
  end if;

  if (select count(*) from phase72_weekly_expected_stage) <> expected_weekly
     or exists (
       select 1 from phase72_weekly_expected_stage
       where source_type <> 'THE_WEEKLY'
          or canonical_player_id is not null
          or metadata->>'personal_handicap_eligible' <> 'false'
     ) then
    raise exception 'Phase 72 gate failed: Weekly expectation package invalid';
  end if;

  if exists (
    select 1
    from phase72_weekly_expected_stage w
    left join public.handicap_source_provenance p
      on p.source_fingerprint = w.source_fingerprint
    where p.id is null
       or p.source_type is distinct from w.source_type
       or p.source_ref is distinct from w.source_ref
       or p.source_date is distinct from w.source_date
       or p.source_season is distinct from w.source_season
       or p.source_week is distinct from w.source_week
       or p.original_player_name is distinct from w.original_player_name
       or p.canonical_player_id is distinct from w.canonical_player_id
       or p.original_course_label is distinct from w.original_course_label
       or p.original_course_code is distinct from w.original_course_code
       or p.metadata is distinct from w.metadata
  ) then
    raise exception 'Phase 72 gate failed: existing Weekly provenance mismatch';
  end if;

  if (select count(*) from phase72_snapshot_stage) <> expected_snapshots
     or (select count(distinct id) from phase72_snapshot_stage)
          <> expected_snapshots
     or exists (
       select 1 from phase72_snapshot_stage
       where calculation_run_id <> new_run
          or difficulty not in ('easy', 'hard')
          or review_scope not in ('KWT_ONLY','WEEKLY_ONLY','KWT_PLUS_WEEKLY')
          or publication_status <> 'UNPUBLISHED'
          or effective_from is not null
          or slope is not null and slope <= 0.01
     ) then
    raise exception 'Phase 72 gate failed: snapshot package invalid';
  end if;

  if exists (
    select 1 from phase72_snapshot_stage s
    join public.handicap_rating_snapshots p on p.id = s.id
  ) then
    raise exception 'Phase 72 gate failed: snapshot UUID already exists';
  end if;

  if exists (
    select 1 from phase72_snapshot_stage s
    join public.handicap_rating_snapshots p
      on p.calculation_run_id = s.calculation_run_id
     and p.course_id = s.course_id
     and p.difficulty = s.difficulty
     and p.model_version = s.model_version
     and p.review_scope = s.review_scope
  ) then
    raise exception 'Phase 72 gate failed: snapshot identity already exists';
  end if;

  if exists (
    select 1
    from phase72_snapshot_stage s
    cross join lateral unnest(s.source_evidence_refs) ref
    left join phase72_kwt_stage k on k.source_fingerprint = ref
    left join public.handicap_source_provenance w
      on w.source_fingerprint = ref
     and w.source_type = 'THE_WEEKLY'
     and w.canonical_player_id is null
     and w.metadata->>'personal_handicap_eligible' = 'false'
    where k.id is null and w.id is null
  ) then
    raise exception 'Phase 72 gate failed: snapshot source reference unresolved';
  end if;

  if exists (
    select 1
    from public.handicap_review_evidence
    where subject_kind = 'SOURCE_RECORD'
      and subject_key = old_run::text
  ) or exists (
    select 1 from public.handicap_review_evidence
    where id = '7322f6c6-6c1a-5292-9bed-28bc52730e10'::uuid
  ) or exists (
    select 1 from public.handicap_review_decisions
    where id = 'ace0f69c-e893-5f12-9240-2545c1cfb1b8'::uuid
  ) then
    raise exception 'Phase 72 gate failed: quarantine audit already exists';
  end if;
end $$;

insert into public.handicap_review_evidence (
  id, subject_kind, subject_key, source_ref, evidence_payload
)
values (
  '7322f6c6-6c1a-5292-9bed-28bc52730e10'::uuid,
  'SOURCE_RECORD',
  '5a57560c-3548-54a8-879c-8fc516a85f26',
  'phase68/recovery_manifest.json',
  jsonb_build_object(
    'kind', 'PHASE67_INVALID_PROVENANCE_BATCH',
    'decision', 'QUARANTINE',
    'reason', 'Phase 67 compact dictionary index corruption',
    'invalid_kwt_rows', 13550,
    'invalid_snapshot_rows', 169,
    'package_sha256', 'ED62C5896D40F4A0394634E5BB670BC617E9C64FFAD008D03B36D4B583832BF2'
  )
);

insert into public.handicap_review_decisions (
  id, evidence_id, subject_kind, subject_key, decision, rationale,
  reviewer_id, decision_sequence
)
values (
  'ace0f69c-e893-5f12-9240-2545c1cfb1b8'::uuid,
  '7322f6c6-6c1a-5292-9bed-28bc52730e10'::uuid,
  'SOURCE_RECORD',
  '5a57560c-3548-54a8-879c-8fc516a85f26',
  'QUARANTINE',
  'Preserve the immutable Phase 67 batch for audit; exclude it from corrected readers and use only the separately verified Phase 68 append-only replacement.',
  null,
  1
);

insert into public.handicap_calculation_runs (
  id, policy_version, model_version, source_package_ref,
  chronology_policy, status, metadata
)
select id, policy_version, model_version, source_package_ref,
       chronology_policy, status,
       metadata || jsonb_build_object(
         'supersedes_calculation_run_id',
           '5a57560c-3548-54a8-879c-8fc516a85f26',
         'supersession_reason',
           'Phase 67 compact dictionary identity corruption; append-only recovery',
         'package_sha256',
           '8440A1D1DCB4C09283F64235F5A85567E59D677DC6494EAB58E1FFB5EE2499CE',
         'snapshot_manifest_sha256',
           '4EDF8E2248030383BDA1D2DAEF028122CE53DA4C212A529C5491D7BA3CA88D53',
         'recovery_status', 'CORRECTED_DRAFT_UNPUBLISHED'
       )
from phase72_run_stage;

insert into public.handicap_source_provenance (
  id, source_fingerprint, source_type, source_ref, source_date,
  source_season, source_week, original_player_name, canonical_player_id,
  original_course_label, original_course_code, metadata
)
select id, source_fingerprint, source_type, source_ref, source_date,
       source_season, source_week, original_player_name, canonical_player_id,
       original_course_label, original_course_code, metadata
from phase72_kwt_stage;

insert into public.handicap_rating_snapshots (
  id, calculation_run_id, course_id, difficulty, course_rating, slope,
  sample_size, distinct_canonical_player_count, rating_confidence,
  model_version, effective_from, effective_period, source_evidence_refs,
  publication_status, review_scope
)
select id, calculation_run_id, course_id, difficulty, course_rating, slope,
       sample_size, distinct_canonical_player_count, rating_confidence,
       model_version, effective_from, effective_period, source_evidence_refs,
       publication_status, review_scope
from phase72_snapshot_stage;

set constraints all immediate;
commit;

-- If any gate or constraint fails, the transaction must abort. Do not run
-- cleanup UPDATE/DELETE statements; the existing invalid batch is immutable.
