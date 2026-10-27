-- PROPOSAL ONLY — NOT FOR PRODUCTION EXECUTION.
-- Phase 101: allow explicitly approved KWT Season/Week periods to satisfy the
-- rating publication gate without inventing a calendar effective_from date.
-- This proposal changes only the publishable-rating view definition and keeps
-- the existing calendar-date path unchanged.

begin;

do $$
declare
  existing_options text[];
begin
  if to_regclass('public.handicap_calculation_runs') is null
     or to_regclass('public.handicap_rating_snapshots') is null
     or to_regclass('public.handicap_source_provenance') is null
     or to_regclass('public.handicap_publishable_rating_snapshots') is null then
    raise exception 'Phase 101 requires the installed Handicap rating publication gate';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'handicap_rating_snapshots'
      and column_name = 'effective_period'
      and data_type = 'text'
  ) then
    raise exception 'Phase 101 requires handicap_rating_snapshots.effective_period text';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'handicap_rating_snapshots'
      and column_name = 'effective_from'
      and data_type = 'date'
  ) then
    raise exception 'Phase 101 requires handicap_rating_snapshots.effective_from date';
  end if;

  select c.reloptions
  into existing_options
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'handicap_publishable_rating_snapshots'
    and c.relkind = 'v';

  if existing_options is null
     or not ('security_invoker=true' = any(existing_options)) then
    raise exception 'Existing rating publication view is not security-invoker';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'handicap_publishable_rating_snapshots'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
      and privilege_type <> 'SELECT'
  ) then
    raise exception 'Unexpected client privilege exists on rating publication view';
  end if;
end
$$;

create or replace view public.handicap_publishable_rating_snapshots
with (security_invoker = true)
as
select s.*
from public.handicap_rating_snapshots as s
join public.handicap_calculation_runs as r
  on r.id = s.calculation_run_id
where r.status = 'COMPLETED'
  and r.publication_eligibility = 'ELIGIBLE'
  and s.publication_status = 'PUBLISHED'
  and (
    s.effective_from is not null
    or (
      s.effective_from is null
      and s.effective_period ~ '^KWT S[0-9]+W[0-9]+ through S[0-9]+W[0-9]+; observed S[0-9]+W[0-9]+(, S[0-9]+W[0-9]+)*; OFFICIAL_KWT_SEQUENCE; calendar date unavailable$'
      and r.chronology_policy = 'OFFICIAL_KWT_SEQUENCE'
      and coalesce(r.metadata ->> 'allow_official_kwt_sequence_publication', 'false') = 'true'
    )
  )
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

revoke all on table public.handicap_publishable_rating_snapshots from public, anon, authenticated;
grant select on table public.handicap_publishable_rating_snapshots to service_role;

commit;
