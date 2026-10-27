-- PROPOSAL ONLY — NOT FOR PRODUCTION EXECUTION.
-- Phase 73: fail-closed publication eligibility for Handicap snapshots.
--
-- This proposal is intentionally additive. It does not import, update, delete,
-- truncate, publish, or supersede any existing evidence. Existing runs become
-- QUARANTINED by the non-null default. A later, separately reviewed workflow
-- may create an ELIGIBLE completed run and published snapshots.
--
-- The two views below are the single read contract for official selection. They
-- are invoker-security views with no client grants. All application/RPC readers
-- must use these views and must not fall back to the base tables or legacy
-- Handicap tables.

begin;

do $$
begin
  if to_regclass('public.handicap_calculation_runs') is null
     or to_regclass('public.handicap_rating_snapshots') is null
     or to_regclass('public.handicap_index_snapshots') is null
     or to_regclass('public.handicap_source_provenance') is null then
    raise exception 'Phase 73 requires all Handicap persistence tables';
  end if;
end
$$;

do $$
declare
  existing_type text;
  existing_nullable text;
  existing_default text;
begin
  select data_type, is_nullable, column_default
  into existing_type, existing_nullable, existing_default
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'handicap_calculation_runs'
    and column_name = 'publication_eligibility';

  if existing_type is null then
    alter table public.handicap_calculation_runs
      add column publication_eligibility text
      not null default 'QUARANTINED';
  elsif existing_type <> 'text'
     or existing_nullable <> 'NO'
     or existing_default is null
     or existing_default not like '%QUARANTINED%' then
    raise exception 'Existing publication_eligibility column is incompatible';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.handicap_calculation_runs'::regclass
      and conname = 'handicap_calculation_runs_publication_eligibility_check'
  ) then
    alter table public.handicap_calculation_runs
      add constraint handicap_calculation_runs_publication_eligibility_check
      check (publication_eligibility in ('QUARANTINED', 'ELIGIBLE'));
  end if;
end
$$;

-- The existing schema intentionally allowed only unpublished draft states. Add
-- the future publication state without publishing any current row. The views
-- below still require every independent run/provenance/effective-date gate.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.handicap_rating_snapshots'::regclass
      and conname = 'handicap_rating_snapshots_publication_status_check'
  ) then
    raise exception 'Expected rating publication-status constraint is missing';
  end if;

  alter table public.handicap_rating_snapshots
    drop constraint handicap_rating_snapshots_publication_status_check;
  alter table public.handicap_rating_snapshots
    add constraint handicap_rating_snapshots_publication_status_check
    check (publication_status in ('DRAFT', 'PROVISIONAL', 'UNPUBLISHED', 'PUBLISHED'));
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.handicap_index_snapshots'::regclass
      and conname = 'handicap_index_snapshots_publication_status_check'
  ) then
    raise exception 'Expected index publication-status constraint is missing';
  end if;

  alter table public.handicap_index_snapshots
    drop constraint handicap_index_snapshots_publication_status_check;
  alter table public.handicap_index_snapshots
    add constraint handicap_index_snapshots_publication_status_check
    check (publication_status in ('DRAFT', 'PROVISIONAL', 'UNPUBLISHED', 'PUBLISHED'));
end
$$;

do $$
begin
  if to_regclass('public.handicap_publishable_rating_snapshots') is not null
     or to_regclass('public.handicap_publishable_index_snapshots') is not null then
    raise exception 'Phase 73 publication views already exist; stop for review';
  end if;
end
$$;

create view public.handicap_publishable_rating_snapshots
with (security_invoker = true)
as
select s.*
from public.handicap_rating_snapshots as s
join public.handicap_calculation_runs as r
  on r.id = s.calculation_run_id
where r.status = 'COMPLETED'
  and r.publication_eligibility = 'ELIGIBLE'
  and s.publication_status = 'PUBLISHED'
  and s.effective_from is not null
  and s.slope is not null
  and s.slope > 0.01
  and cardinality(s.source_evidence_refs) > 0
  and not exists (
    select 1
    from unnest(s.source_evidence_refs) as refs(source_fingerprint)
    left join public.handicap_source_provenance as p
      on p.source_fingerprint = refs.source_fingerprint
    where p.id is null
       or p.source_type not in ('KWT', 'THE_WEEKLY')
       or (
         p.source_type = 'KWT'
         and (
           p.canonical_player_id is null
           or nullif(btrim(coalesce(p.original_player_name, '')), '') is null
           or nullif(btrim(coalesce(p.metadata ->> 'source_player_id', '')), '') is null
           or p.source_fingerprint !~ '^KWT[|][^|]+[|][^|]+[|][^|]+[|][^|]+$'
         )
       )
       or (
         p.source_type = 'THE_WEEKLY'
         and coalesce(p.metadata ->> 'personal_handicap_eligible', 'true') <> 'false'
       )
  );

create view public.handicap_publishable_index_snapshots
with (security_invoker = true)
as
select i.*
from public.handicap_index_snapshots as i
join public.handicap_calculation_runs as r
  on r.id = i.calculation_run_id
where r.status = 'COMPLETED'
  and r.publication_eligibility = 'ELIGIBLE'
  and i.publication_status = 'PUBLISHED'
  and i.chronology_confidence = 'EXACT'
  and i.resulting_index is not null
  and cardinality(i.latest_ten_source_round_ids) > 0
  and cardinality(i.best_five_source_round_ids) > 0
  and not exists (
    select 1
    from unnest(i.source_round_ids) as refs(source_fingerprint)
    left join public.handicap_source_provenance as p
      on p.source_fingerprint = refs.source_fingerprint
    where p.id is null
       or p.source_type <> 'KWT'
       or p.canonical_player_id is null
       or nullif(btrim(coalesce(p.original_player_name, '')), '') is null
       or nullif(btrim(coalesce(p.metadata ->> 'source_player_id', '')), '') is null
       or p.source_fingerprint !~ '^KWT[|][^|]+[|][^|]+[|][^|]+[|][^|]+$'
  );

revoke all on table public.handicap_publishable_rating_snapshots from public, anon, authenticated;
revoke all on table public.handicap_publishable_index_snapshots from public, anon, authenticated;
grant select on table public.handicap_publishable_rating_snapshots to service_role;
grant select on table public.handicap_publishable_index_snapshots to service_role;

commit;
