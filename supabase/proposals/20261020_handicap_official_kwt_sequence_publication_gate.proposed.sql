-- PROPOSAL ONLY — NOT FOR PRODUCTION EXECUTION.
-- Phase 96: explicitly opt in to official KWT season/week chronology for
-- personal-index publication. This does not assert exact play timestamps.
--
-- Preconditions:
--   * run the Phase 96 read-only preflight first;
--   * confirm the installed Phase 73 gate and security_invoker view;
--   * confirm the target run explicitly uses chronology_policy
--     OFFICIAL_KWT_SEQUENCE and metadata allow_official_kwt_sequence_publication=true;
--   * do not alter existing DRAFT/QUARANTINED runs or snapshot rows.
--
-- This proposal changes only the chronology check and the existing index view.
-- It does not grant client access, change RLS, publish rows, or create functions.

begin;

do $$
declare
  existing_definition text;
begin
  if to_regclass('public.handicap_calculation_runs') is null
     or to_regclass('public.handicap_index_snapshots') is null
     or to_regclass('public.handicap_publishable_index_snapshots') is null then
    raise exception 'Phase 96 requires the installed Handicap publication gate';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'handicap_calculation_runs'
      and column_name = 'chronology_policy'
  ) then
    raise exception 'Phase 96 requires handicap_calculation_runs.chronology_policy';
  end if;

  select pg_get_constraintdef(c.oid)
  into existing_definition
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'handicap_index_snapshots'
    and c.conname = 'handicap_index_snapshots_chronology_confidence_check'
    and c.contype = 'c';

  if existing_definition is null then
    raise exception 'Expected chronology confidence constraint is missing';
  end if;
  if existing_definition like '%OFFICIAL_KWT_SEQUENCE%' then
    raise exception 'Phase 96 chronology constraint is already installed';
  end if;
  if existing_definition not like '%EXACT%'
     or existing_definition not like '%PERIOD_WINDOW%'
     or existing_definition not like '%ORDERED_UNDATED%'
     or existing_definition not like '%UNKNOWN%'
     or existing_definition not like '%AMBIGUOUS%' then
    raise exception 'Existing chronology confidence constraint is incompatible';
  end if;
end
$$;

alter table public.handicap_index_snapshots
  drop constraint handicap_index_snapshots_chronology_confidence_check;

alter table public.handicap_index_snapshots
  add constraint handicap_index_snapshots_chronology_confidence_check
  check (chronology_confidence in (
    'EXACT',
    'OFFICIAL_KWT_SEQUENCE',
    'PERIOD_WINDOW',
    'ORDERED_UNDATED',
    'UNKNOWN',
    'AMBIGUOUS'
  ));

create or replace view public.handicap_publishable_index_snapshots
with (security_invoker = true)
as
select i.*
from public.handicap_index_snapshots as i
join public.handicap_calculation_runs as r
  on r.id = i.calculation_run_id
where r.status = 'COMPLETED'
  and r.publication_eligibility = 'ELIGIBLE'
  and i.publication_status = 'PUBLISHED'
  and (
    i.chronology_confidence = 'EXACT'
    or (
      i.chronology_confidence = 'OFFICIAL_KWT_SEQUENCE'
      and r.chronology_policy = 'OFFICIAL_KWT_SEQUENCE'
      and coalesce(r.metadata ->> 'allow_official_kwt_sequence_publication', 'false') = 'true'
    )
  )
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

-- Preserve the Phase 73 client boundary. The view remains privileged-reader
-- only and security-invoker; no anon/authenticated grants are added.
revoke all on table public.handicap_publishable_index_snapshots from public, anon, authenticated;
grant select on table public.handicap_publishable_index_snapshots to service_role;

commit;
