-- READ-ONLY verification for major_masters_signup_groups_and_cut.sql.
-- This file contains one SELECT statement using catalog/data inspection only.
-- It does not create, alter, insert, update, delete, grant, revoke, or execute
-- any application RPC, and it does not mutate production in any way.

with object_state as (
  select
    to_regclass('public.major_events') as events_oid,
    to_regclass('public.major_entry_weekend_status') as weekend_status_oid,
    to_regclass('public.major_schedule_groups') as groups_oid,
    to_regclass('public.major_schedule_group_members') as group_members_oid,
    to_regclass('public.major_final_placements') as placements_oid,
    to_regclass('public.major_test_event_testers') as testers_oid
),
column_state as (
  select
    count(*) filter (where column_name='signup_hard_capacity')>0 as has_hard_capacity,
    count(*) filter (where column_name='initial_release_capacity')>0 as has_initial_release,
    count(*) filter (where column_name='schedule_timezone')>0 as has_schedule_timezone,
    count(*) filter (where column_name='secondary_trophy_display_name')>0 as has_secondary_trophy_name,
    count(*) filter (where column_name='is_test_event')>0 as has_test_marker,
    count(*) filter (where column_name='test_event_listed')>0 as has_test_listing
  from information_schema.columns
  where table_schema='public' and table_name='major_events'
),
test_seed_state as (
  select case
    when events_oid is null or not has_test_marker or not has_test_listing then null::integer
    else ((xpath(
      '/table/row/seed_count/text()',
      query_to_xml(
        $query$
          select count(*) as seed_count
          from public.major_events
          where slug='test'
            and name='Test'
            and is_test_event=true
            and is_public=false
            and signup_open=false
        $query$,
        true,
        false,
        ''
      )
    ))[1]::text)::integer
  end as seed_count
  from object_state cross join column_state
),
checks as (
  select 10 as display_order, 'public.major_entry_weekend_status table'::text as object_name,
    weekend_status_oid is not null as installed,
    'Private pending/main/secondary weekend decisions.'::text as explanation from object_state
  union all select 20, 'public.major_schedule_groups table', groups_oid is not null,
    'Manual qualifying, Main, and Secondary room/group records.' from object_state
  union all select 30, 'public.major_schedule_group_members table', group_members_oid is not null,
    'Event-isolated player membership in scheduled rooms.' from object_state
  union all select 40, 'public.major_final_placements table', placements_oid is not null,
    'Permanent placements, tied-result flags, winners, and frozen names.' from object_state
  union all select 50, 'public.major_test_event_testers table', testers_oid is not null,
    'Canonical player UUID allowlist for controlled TEST signup.' from object_state

  union all select 60, 'major_events.signup_hard_capacity column', has_hard_capacity,
    'Fixed 100-player event ceiling support.' from column_state
  union all select 70, 'major_events.initial_release_capacity column', has_initial_release,
    'Configurable Release 1 support, defaulting to 50.' from column_state
  union all select 80, 'major_events.schedule_timezone column', has_schedule_timezone,
    'Canonical schedule-time conversion using an IANA timezone.' from column_state
  union all select 90, 'major_events.secondary_trophy_display_name column', has_secondary_trophy_name,
    'Optional administrator-editable below-cut trophy wording.' from column_state
  union all select 100, 'major_events TEST-control columns', has_test_marker and has_test_listing,
    'Private TEST identity and controlled authenticated listing support.' from column_state

  union all select 110, 'public.configure_major_signup_release(...)',
    to_regprocedure('public.configure_major_signup_release(uuid,integer,timestamp with time zone,integer,boolean,timestamp with time zone,uuid,text)') is not null,
    'Protected Release 1, public-opening, priority, and timezone configuration RPC.'
  union all select 120, 'public.create_major_time_slot(uuid,timestamp,text)',
    to_regprocedure('public.create_major_time_slot(uuid,timestamp without time zone,text)') is not null,
    'Protected local-to-canonical time-slot creation RPC.'
  union all select 130, 'public.admin_set_major_day_choice(uuid,uuid,uuid)',
    to_regprocedure('public.admin_set_major_day_choice(uuid,uuid,uuid)') is not null,
    'Administrator schedule override RPC.'
  union all select 140, 'public.set_major_weekend_status(uuid,text)',
    to_regprocedure('public.set_major_weekend_status(uuid,text)') is not null,
    'Private Friday pending/main/secondary staging RPC.'
  union all select 150, 'public.save_major_schedule_group(...)',
    to_regprocedure('public.save_major_schedule_group(uuid,uuid,uuid,uuid,text,text,text,text,text,boolean,boolean,uuid[])') is not null,
    'Protected manual room/group assignment RPC.'
  union all select 160, 'public.save_major_final_placement(...)',
    to_regprocedure('public.save_major_final_placement(uuid,text,integer,text,boolean,boolean,boolean)') is not null,
    'Protected tied-placement and explicit-winner history RPC.'
  union all select 170, 'public.add_major_test_tester(uuid,uuid)',
    to_regprocedure('public.add_major_test_tester(uuid,uuid)') is not null,
    'Administrator canonical-UUID TEST allowlist addition RPC.'
  union all select 180, 'public.remove_major_test_tester(uuid,uuid)',
    to_regprocedure('public.remove_major_test_tester(uuid,uuid)') is not null,
    'Administrator TEST allowlist removal RPC that preserves history.'

  union all select 190, 'Row Level Security on all five new tables',
    coalesce((select relrowsecurity from pg_catalog.pg_class where oid=weekend_status_oid),false)
      and coalesce((select relrowsecurity from pg_catalog.pg_class where oid=groups_oid),false)
      and coalesce((select relrowsecurity from pg_catalog.pg_class where oid=group_members_oid),false)
      and coalesce((select relrowsecurity from pg_catalog.pg_class where oid=placements_oid),false)
      and coalesce((select relrowsecurity from pg_catalog.pg_class where oid=testers_oid),false),
    'All new workflow and TEST tables must enforce Row Level Security.' from object_state
  union all select 200, 'Private seeded TEST event', coalesce(seed_count=1,false),
    case when seed_count is null then 'NOT CHECKED: required event table/columns are missing.'
      when seed_count=1 then 'FOUND: exactly one private, closed TEST event is seeded.'
      else format('MISSING / UNEXPECTED: found %s matching private TEST events.',seed_count) end
    from test_seed_state
),
totals as (
  select count(*) filter (where installed) as installed_count, count(*) as expected_count from checks
),
report as (
  select 0 as display_order,
    case when installed_count=0 then 'NOT INSTALLED'
      when installed_count=expected_count then 'COMPLETE'
      else 'PARTIAL' end as status,
    'OVERALL MASTERS SIGNUP/GROUPING/TEST INSTALLATION'::text as object_name,
    format('%s of %s required checks passed.',installed_count,expected_count) as explanation
  from totals
  union all
  select display_order,case when installed then 'OK' else 'MISSING' end,object_name,explanation from checks
)
select status,object_name,explanation
from report
order by display_order;
