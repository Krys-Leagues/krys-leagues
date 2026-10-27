-- PROPOSAL ONLY — DO NOT EXECUTE IN PRODUCTION.
-- Phase 127: additive persistence/read-model support for the approved rolling-20 policy.
-- This proposal does not import, publish, update, or delete Handicap data.

begin;

do $$
declare
  column_count integer;
  unique_definition text;
  trigger_definition text;
begin
  if to_regclass('public.handicap_index_snapshots') is null
     or to_regclass('public.handicap_calculation_runs') is null
     or to_regclass('public.handicap_source_provenance') is null
     or to_regclass('public.handicap_publishable_index_snapshots') is null then
    raise exception 'Phase 127 requires the installed Handicap persistence and publication view';
  end if;

  select count(*) into column_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'handicap_index_snapshots'
    and column_name in ('active_twenty_source_round_ids', 'active_round_count', 'handicap_status', 'effective_from');
  if column_count <> 0 then
    raise exception 'Phase 127 rolling-20 columns already exist; stop and inspect instead of reapplying';
  end if;

  select pg_get_constraintdef(c.oid)
  into unique_definition
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'handicap_index_snapshots'
    and c.contype = 'u';
  if unique_definition is distinct from 'UNIQUE (calculation_run_id, canonical_player_id, differential_model_version)' then
    raise exception 'Unexpected Handicap index uniqueness contract: %', coalesce(unique_definition, '<missing>');
  end if;

  if not coalesce((select reloptions @> array['security_invoker=true']
                   from pg_class c
                   join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public'
                     and c.relname = 'handicap_publishable_index_snapshots'), false) then
    raise exception 'Publishable index view is not security-invoker';
  end if;

  if has_table_privilege('anon', 'public.handicap_index_snapshots', 'SELECT')
     or has_table_privilege('authenticated', 'public.handicap_index_snapshots', 'SELECT')
     or has_table_privilege('anon', 'public.handicap_publishable_index_snapshots', 'SELECT')
     or has_table_privilege('authenticated', 'public.handicap_publishable_index_snapshots', 'SELECT') then
    raise exception 'Unexpected client SELECT privilege exists';
  end if;

  select pg_get_triggerdef(t.oid, true)
  into trigger_definition
  from pg_trigger t
  where t.tgrelid = 'public.handicap_index_snapshots'::regclass
    and t.tgname = 'handicap_handicap_index_snapshots_append_only'
    and not t.tgisinternal;
  if trigger_definition is null
     or trigger_definition not like '%handicap_private.reject_history_mutation%' then
    raise exception 'Existing index append-only trigger is missing or incompatible';
  end if;
end
$$;

alter table public.handicap_index_snapshots
  add column active_twenty_source_round_ids text[] not null default '{}',
  add column active_round_count integer not null default 0,
  add column handicap_status text not null default 'LEGACY_BEST_FIVE',
  add column effective_from date;

alter table public.handicap_index_snapshots
  add constraint handicap_index_snapshots_active_round_limit_check
    check (active_round_count between 0 and 20),
  add constraint handicap_index_snapshots_active_round_count_check
    check (active_round_count = cardinality(active_twenty_source_round_ids)),
  add constraint handicap_index_snapshots_handicap_status_check
    check (handicap_status in ('LEGACY_BEST_FIVE', 'NOT_YET_RATED', 'PROVISIONAL', 'OFFICIAL_ELIGIBLE')),
  add constraint handicap_index_snapshots_handicap_status_count_check
    check (
      (handicap_status = 'NOT_YET_RATED' and active_round_count = 0)
      or (handicap_status = 'PROVISIONAL' and active_round_count between 1 and 19)
      or (handicap_status = 'OFFICIAL_ELIGIBLE' and active_round_count = 20)
      or handicap_status = 'LEGACY_BEST_FIVE'
    );

-- Preserve the existing view's security, provenance, chronology, and client
-- privilege contract while excluding legacy best-five snapshots from the new
-- publication path. New snapshots must carry the rolling-20 fields and an
-- explicit effective publication date; no historical calendar date is inferred.
create or replace view public.handicap_publishable_index_snapshots
with (security_invoker = true)
as
select i.id,
       i.calculation_run_id,
       i.canonical_player_id,
       i.source_round_ids,
       i.rating_snapshot_ids,
       i.rating_version_ids,
       i.differential_model_version,
       i.latest_ten_source_round_ids,
       i.best_five_source_round_ids,
       i.resulting_index,
       i.chronology_confidence,
       i.publication_status,
       i.created_at,
       i.active_twenty_source_round_ids,
       i.active_round_count,
       i.handicap_status,
       i.effective_from
from public.handicap_index_snapshots as i
join public.handicap_calculation_runs as r
  on r.id = i.calculation_run_id
where r.status = 'COMPLETED'
  and r.publication_eligibility = 'ELIGIBLE'
  and i.publication_status = 'PUBLISHED'
  and i.differential_model_version = 'krys-handicap-candidate-a-v1'
  and i.handicap_status in ('PROVISIONAL', 'OFFICIAL_ELIGIBLE')
  and (
    (i.handicap_status = 'OFFICIAL_ELIGIBLE' and i.active_round_count = 20 and cardinality(i.active_twenty_source_round_ids) = 20)
    or (i.handicap_status = 'PROVISIONAL' and i.active_round_count between 1 and 19 and cardinality(i.active_twenty_source_round_ids) between 1 and 19)
  )
  and i.effective_from is not null
  and (
    i.chronology_confidence = 'EXACT'
    or (
      i.chronology_confidence = 'OFFICIAL_KWT_SEQUENCE'
      and r.chronology_policy = 'OFFICIAL_KWT_SEQUENCE'
      and coalesce(r.metadata ->> 'allow_official_kwt_sequence_publication', 'false') = 'true'
    )
  )
  and i.resulting_index is not null
  and cardinality(i.source_round_ids) > 0
  and i.source_round_ids @> i.active_twenty_source_round_ids
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

revoke all on table public.handicap_publishable_index_snapshots from public, anon, authenticated;
grant select on table public.handicap_publishable_index_snapshots to service_role;

commit;
