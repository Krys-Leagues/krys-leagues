-- Read-only production verification for major_schedule_lock_configuration.sql.
-- This statement inspects metadata and existing derived deadlines; it performs no mutations.
with
column_check as (
  select
    exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'major_events'
        and c.column_name = 'schedule_lock_hours_before_first_slot'
        and c.data_type = 'integer'
        and c.is_nullable = 'NO'
    ) as is_valid
),
default_check as (
  select
    exists (
      select 1
      from pg_catalog.pg_attribute a
      join pg_catalog.pg_class t on t.oid = a.attrelid
      join pg_catalog.pg_namespace n on n.oid = t.relnamespace
      join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where n.nspname = 'public'
        and t.relname = 'major_events'
        and a.attname = 'schedule_lock_hours_before_first_slot'
        and pg_catalog.pg_get_expr(d.adbin, d.adrelid) in ('24', '24::integer')
    ) as is_valid
),
constraint_check as (
  select
    exists (
      select 1
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_class t on t.oid = c.conrelid
      join pg_catalog.pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'major_events'
        and c.conname = 'major_events_schedule_lock_hours_nonnegative'
        and c.contype = 'c'
        and pg_catalog.pg_get_constraintdef(c.oid) ilike '%schedule_lock_hours_before_first_slot%>= 0%'
    ) as is_valid
),
sync_function as (
  select p.oid, pg_catalog.pg_get_functiondef(p.oid) as definition
  from pg_catalog.pg_proc p
  where p.oid = pg_catalog.to_regprocedure('public.sync_major_play_day_lock_deadline()')
),
sync_check as (
  select exists (
    select 1
    from sync_function f
    where f.definition ilike '%schedule_lock_hours_before_first_slot%'
      and f.definition ilike '%is_available%'
      and f.definition ilike '%make_interval%'
  ) as is_valid
),
rpc_function as (
  select p.oid, p.prosecdef, p.proconfig, p.proacl, p.proowner
  from pg_catalog.pg_proc p
  where p.oid = pg_catalog.to_regprocedure('public.set_major_schedule_lock_hours(uuid,integer)')
),
rpc_check as (
  select exists (
    select 1
    from rpc_function f
    where f.prosecdef
      and coalesce(f.proconfig, array[]::text[]) && array['search_path=', 'search_path=""']
  ) as is_valid
),
privilege_check as (
  select exists (
    select 1
    from rpc_function f
    where pg_catalog.has_function_privilege('authenticated', f.oid, 'EXECUTE')
      and not pg_catalog.has_function_privilege('anon', f.oid, 'EXECUTE')
      and not exists (
        select 1
        from pg_catalog.aclexplode(coalesce(f.proacl, pg_catalog.acldefault('f', f.proowner))) acl
        where acl.grantee = 0
          and acl.privilege_type = 'EXECUTE'
      )
  ) as is_valid
),
day_column_check as (
  select exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'major_play_days'
      and c.column_name = 'selection_locks_at'
  ) as is_valid
),
checks as (
  select 'Event lock-hours column is an integer, required value'::text as check_name,
         (select is_valid from column_check) as passed
  union all
  select 'Event lock-hours default is 24', (select is_valid from default_check)
  union all
  select 'Nonnegative lock-hours validation exists', (select is_valid from constraint_check)
  union all
  select 'Day deadline sync uses available slots and event configuration', (select is_valid from sync_check)
  union all
  select 'Admin lock-hours function is protected and has an empty search path', (select is_valid from rpc_check)
  union all
  select 'Only signed-in users receive function execution permission', (select is_valid from privilege_check)
  union all
  select 'Existing play days have an inspectable lock deadline column', (select is_valid from day_column_check)
),
overall as (
  select case
    when not (select is_valid from column_check)
     and not exists (select 1 from rpc_function) then 'NOT INSTALLED'
    when bool_and(passed) then 'COMPLETE'
    else 'PARTIAL'
  end as status
  from checks
),
deadline_summary as (
  select
    count(*) as existing_play_days,
    count(d.selection_locks_at) as days_with_calculated_deadlines,
    count(*) filter (where d.selection_locks_at is null) as days_without_available_slot_deadlines,
    min(d.selection_locks_at) as earliest_current_deadline,
    max(d.selection_locks_at) as latest_current_deadline
  from public.major_play_days d
)
select 0 as display_order,
       'OVERALL STATUS'::text as item,
       o.status as result,
       'COMPLETE means every required configuration, function, and permission check passed.'::text as explanation
from overall o
union all
select row_number() over (order by c.check_name)::integer,
       c.check_name,
       case when c.passed then 'OK' else 'MISSING OR INCORRECT' end,
       case when c.passed then 'This requirement is ready.' else 'Review this item before relying on configurable schedule locks.' end
from checks c
union all
select 100,
       'EXISTING PLAY-DAY DEADLINES',
       format('%s total day(s); %s with deadlines; %s without an available-slot deadline',
              d.existing_play_days, d.days_with_calculated_deadlines, d.days_without_available_slot_deadlines),
       format('Current deadline range: %s through %s. A null deadline is expected when a day has no available slots.',
              coalesce(d.earliest_current_deadline::text, 'none'), coalesce(d.latest_current_deadline::text, 'none'))
from deadline_summary d
order by display_order, item;
