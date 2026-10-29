-- READ-ONLY inspection for a failed or partial majors_foundation.sql install.
-- This file contains one SELECT statement. It does not create, alter, insert,
-- update, delete, grant, revoke, or otherwise mutate production data/schema.

with object_state as (
  select
    to_regclass('public.major_events') as major_events_oid,
    to_regclass('public.major_entries') as major_entries_oid,
    to_regprocedure('public.touch_major_updated_at()') as touch_function_oid,
    to_regprocedure(
      'public.save_major_event(uuid,text,text,integer,text,boolean,timestamp with time zone,timestamp with time zone,boolean,text,text,text,text,timestamp with time zone,boolean)'
    ) as save_event_function_oid,
    to_regprocedure('public.signup_for_major(uuid)') as signup_function_oid,
    to_regprocedure('public.set_major_entry_status(uuid,text)') as entry_status_function_oid,
    to_regprocedure('public.admin_register_major_player(uuid,uuid)') as admin_register_function_oid
),
seed_state as (
  select
    case
      when major_events_oid is null then null::integer
      else (
        (
          xpath(
            '/table/row/seed_count/text()',
            query_to_xml(
              $query$
                select count(*) as seed_count
                from public.major_events
                where (slug, name) in (
                  ('major-1', 'Major 1'),
                  ('major-2', 'Major 2'),
                  ('major-3', 'Major 3'),
                  ('major-4', 'Major 4')
                )
                  and status = 'draft'
                  and signup_open = false
                  and is_public = false
              $query$,
              true,
              false,
              ''
            )
          )
        )[1]::text
      )::integer
    end as draft_seed_count
  from object_state
),
checks as (
  select
    10 as display_order,
    'public.major_events table'::text as object_name,
    (major_events_oid is not null) as installed,
    case when major_events_oid is not null
      then 'FOUND: Major event records can exist.'
      else 'MISSING: the Major events table was not installed.'
    end as explanation
  from object_state

  union all
  select
    20,
    'public.major_entries table',
    (major_entries_oid is not null),
    case when major_entries_oid is not null
      then 'FOUND: canonical player signup records can exist.'
      else 'MISSING: the Major entries table was not installed.'
    end
  from object_state

  union all
  select
    30,
    'Row Level Security on both Majors tables',
    coalesce((select relrowsecurity from pg_catalog.pg_class where oid = major_events_oid), false)
      and coalesce((select relrowsecurity from pg_catalog.pg_class where oid = major_entries_oid), false),
    'Both public.major_events and public.major_entries must have RLS enabled.'
  from object_state

  union all
  select
    40,
    'Expected Major read policies',
    (
      select count(*) = 4
      from pg_catalog.pg_policy as policy
      where policy.polrelid in (major_events_oid, major_entries_oid)
        and policy.polname in (
          'Public can read visible Majors',
          'Admins can read all Majors',
          'Public can read visible Major entrants',
          'Admins can read all Major entrants'
        )
    ),
    'Expected four public/admin SELECT policies across the two Majors tables.'
  from object_state

  union all
  select
    50,
    'public.touch_major_updated_at()',
    (touch_function_oid is not null),
    'Maintains updated_at timestamps for Major records.'
  from object_state

  union all
  select
    60,
    'public.save_major_event(...)',
    (save_event_function_oid is not null),
    'Admin RPC for creating and updating a Major event.'
  from object_state

  union all
  select
    70,
    'public.signup_for_major(uuid)',
    (signup_function_oid is not null),
    case when signup_function_oid is not null
      then 'FOUND: player self-signup RPC exists.'
      else 'MISSING: this is the function whose failed compilation may have stopped installation.'
    end
  from object_state

  union all
  select
    80,
    'public.set_major_entry_status(uuid,text)',
    (entry_status_function_oid is not null),
    'Admin RPC for changing a Major entry status.'
  from object_state

  union all
  select
    90,
    'public.admin_register_major_player(uuid,uuid)',
    (admin_register_function_oid is not null),
    'Admin RPC for registering a canonical player UUID.'
  from object_state

  union all
  select
    100,
    'Four private draft Major seed rows',
    coalesce(draft_seed_count = 4, false),
    case
      when draft_seed_count is null then 'NOT CHECKED: public.major_events does not exist.'
      when draft_seed_count = 4 then 'FOUND: all four untouched private draft placeholders exist.'
      else format('PARTIAL: found %s of the four untouched private draft placeholders.', draft_seed_count)
    end
  from seed_state
),
summary as (
  select
    0 as display_order,
    'OVERALL PARTIAL-INSTALL RESULT'::text as object_name,
    bool_and(installed) as installed,
    case
      when bool_and(installed)
        then 'COMPLETE: every checked Majors foundation object is present.'
      when bool_or(installed)
        then 'PARTIAL: some Majors foundation objects exist and some are missing. The corrected idempotent migration should be rerun in full.'
      else 'NOT INSTALLED: none of the checked Majors foundation objects were found.'
    end as explanation
  from checks

  union all
  select display_order, object_name, installed, explanation
  from checks
)
select
  case when installed then 'OK' else 'MISSING / PARTIAL' end as status,
  object_name,
  explanation
from summary
order by display_order;
