-- READ-ONLY production verification for major_standard_signup_times.sql.
-- Catalog SELECTs only: this file creates nothing and calls no application RPC.
--
-- Naming note: the installed/application contract uses major_event_id and
-- local_time (the concrete equivalents of generic event_id and time_of_day).
with
expected_columns(column_name, data_type, nullable) as (
  values
    ('id', 'uuid', 'NO'),
    ('major_event_id', 'uuid', 'NO'),
    ('local_time', 'time without time zone', 'NO'),
    ('label', 'text', 'YES'),
    ('is_active', 'boolean', 'NO'),
    ('created_at', 'timestamp with time zone', 'NO'),
    ('updated_at', 'timestamp with time zone', 'NO')
),
expected_functions(function_name, callable_arguments) as (
  values
    ('save_major_standard_signup_time', 'uuid, uuid, time without time zone, text'),
    ('remove_major_standard_signup_time', 'uuid, uuid'),
    ('copy_major_thursday_times_to_standard', 'uuid'),
    ('apply_major_standard_signup_times', 'uuid')
),
function_catalog as (
  select
    p.oid,
    p.proname as function_name,
    pg_catalog.oidvectortypes(p.proargtypes) as callable_arguments,
    p.prosecdef,
    p.proconfig,
    p.proacl,
    p.proowner,
    pg_catalog.pg_get_functiondef(p.oid) as definition
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (select function_name from expected_functions)
),
checks(category, check_name, passed, detail) as (
  select
    'TABLE',
    'public.major_standard_signup_times exists',
    pg_catalog.to_regclass('public.major_standard_signup_times') is not null,
    'Event-level standard signup-time template table.'

  union all
  select
    'RLS',
    'RLS is enabled on public.major_standard_signup_times',
    coalesce((
      select c.relrowsecurity
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'major_standard_signup_times'
        and c.relkind in ('r', 'p')
    ), false),
    'Direct table access remains subject to row-level security.'

  union all
  select
    'COLUMN',
    format('Template column %s exists with the expected type', e.column_name),
    exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'major_standard_signup_times'
        and c.column_name = e.column_name
        and c.data_type = e.data_type
        and c.is_nullable = e.nullable
    ),
    case e.column_name
      when 'major_event_id' then 'Application event key (the requested event_id concept).'
      when 'local_time' then 'Application clock-time value (the requested time_of_day concept).'
      else format('Expected %s column.', e.column_name)
    end
  from expected_columns e

  union all
  select
    'COLUMN',
    'major_time_slots.standard_signup_time_id exists',
    exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'major_time_slots'
        and c.column_name = 'standard_signup_time_id'
        and c.data_type = 'uuid'
    ),
    'Links only template-managed concrete day slots back to their template time.'

  union all
  select
    'CONSTRAINT',
    'Template table primary key exists',
    exists (
      select 1
      from pg_catalog.pg_constraint c
      where c.conrelid = pg_catalog.to_regclass('public.major_standard_signup_times')
        and c.contype = 'p'
    ),
    'Template rows have stable UUID identity.'

  union all
  select
    'CONSTRAINT',
    'Template event foreign key exists',
    exists (
      select 1
      from pg_catalog.pg_constraint c
      where c.conrelid = pg_catalog.to_regclass('public.major_standard_signup_times')
        and c.contype = 'f'
        and c.confrelid = pg_catalog.to_regclass('public.major_events')
    ),
    'Every template belongs to an existing Major event.'

  union all
  select
    'CONSTRAINT',
    'Concrete slots have the template foreign key',
    exists (
      select 1
      from pg_catalog.pg_constraint c
      where c.conrelid = pg_catalog.to_regclass('public.major_time_slots')
        and c.conname = 'major_time_slots_standard_signup_time_fk'
        and c.contype = 'f'
        and c.confrelid = pg_catalog.to_regclass('public.major_standard_signup_times')
    ),
    'Template deletion cannot cascade-delete player-facing day slots.'

  union all
  select
    'INDEX',
    expected.index_name || ' exists',
    pg_catalog.to_regclass('public.' || expected.index_name) is not null,
    expected.purpose
  from (values
    ('major_standard_signup_times_active_time_uidx', 'Prevents duplicate active clock times within one event.'),
    ('major_standard_signup_times_event_idx', 'Supports ordered event-template lookup.'),
    ('major_time_slots_standard_signup_time_idx', 'Supports template-managed slot reconciliation.')
  ) as expected(index_name, purpose)

  union all
  select
    'POLICY',
    'Site-admin template-management policy exists',
    exists (
      select 1
      from pg_catalog.pg_policy p
      join pg_catalog.pg_class c on c.oid = p.polrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'major_standard_signup_times'
        and p.polname = 'Site admins manage Major standard signup times'
        and p.polcmd = '*'
        and exists (
          select 1
          from unnest(p.polroles) role_oid
          join pg_catalog.pg_roles r on r.oid = role_oid
          where r.rolname = 'authenticated'
        )
        and pg_catalog.pg_get_expr(p.polqual, p.polrelid) ilike '%is_current_user_site_admin%'
        and pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) ilike '%is_current_user_site_admin%'
    ),
    'Authenticated users still need centralized site-admin authorization.'

  union all
  select
    'TABLE PRIVILEGE',
    'Template table is readable only through the intended authenticated grant plus RLS',
    pg_catalog.to_regclass('public.major_standard_signup_times') is not null
      and pg_catalog.has_table_privilege('authenticated', 'public.major_standard_signup_times', 'SELECT')
      and not pg_catalog.has_table_privilege('anon', 'public.major_standard_signup_times', 'SELECT'),
    'Anon has no direct template-table read privilege; authenticated reads remain RLS-protected.'

  union all
  select
    'TRIGGER',
    'Template updated_at trigger exists and is enabled',
    exists (
      select 1
      from pg_catalog.pg_trigger t
      where t.tgrelid = pg_catalog.to_regclass('public.major_standard_signup_times')
        and t.tgname = 'major_standard_signup_times_touch_updated_at'
        and not t.tgisinternal
        and t.tgenabled <> 'D'
    ),
    'Template edit timestamps stay current.'

  union all
  select
    'FUNCTION',
    format('%s(%s) exists', e.function_name, e.callable_arguments),
    exists (
      select 1 from function_catalog f
      where f.function_name = e.function_name
        and f.callable_arguments = e.callable_arguments
    ),
    'Signature comparison uses callable argument types, not declared parameter names.'
  from expected_functions e

  union all
  select
    'FUNCTION SECURITY',
    format('%s(%s) is SECURITY DEFINER', e.function_name, e.callable_arguments),
    exists (
      select 1 from function_catalog f
      where f.function_name = e.function_name
        and f.callable_arguments = e.callable_arguments
        and f.prosecdef
    ),
    'Privileged mutation runs through a protected RPC.'
  from expected_functions e

  union all
  select
    'FUNCTION SEARCH PATH',
    format('%s(%s) has a hardened empty search_path', e.function_name, e.callable_arguments),
    exists (
      select 1 from function_catalog f
      where f.function_name = e.function_name
        and f.callable_arguments = e.callable_arguments
        and coalesce(f.proconfig, array[]::text[]) && array['search_path=', 'search_path=""']
    ),
    'Prevents caller-controlled object resolution inside SECURITY DEFINER code.'
  from expected_functions e

  union all
  select
    'FUNCTION PRIVILEGE',
    format('%s(%s) has authenticated-only intended execution', e.function_name, e.callable_arguments),
    exists (
      select 1 from function_catalog f
      where f.function_name = e.function_name
        and f.callable_arguments = e.callable_arguments
        and pg_catalog.has_function_privilege('authenticated', f.oid, 'EXECUTE')
        and not pg_catalog.has_function_privilege('anon', f.oid, 'EXECUTE')
        and not exists (
          select 1
          from pg_catalog.aclexplode(coalesce(f.proacl, pg_catalog.acldefault('f', f.proowner))) acl
          where acl.grantee = 0
            and acl.privilege_type = 'EXECUTE'
        )
    ),
    'PUBLIC and anon execution are revoked; authenticated is explicitly granted.'
  from expected_functions e

  union all
  select
    'FUNCTION AUTHORIZATION',
    format('%s(%s) checks centralized site-admin authorization', e.function_name, e.callable_arguments),
    exists (
      select 1 from function_catalog f
      where f.function_name = e.function_name
        and f.callable_arguments = e.callable_arguments
        and f.definition ilike '%is_current_user_site_admin%'
    ),
    'Every mutation RPC enforces public.is_current_user_site_admin().'
  from expected_functions e

  union all
  select
    'THURSDAY IMPORT',
    'Thursday import uses day 1, available slots, event timezone, and local clock time',
    exists (
      select 1 from function_catalog f
      where f.function_name = 'copy_major_thursday_times_to_standard'
        and f.callable_arguments = 'uuid'
        and f.definition ilike '%day_number = 1%'
        and f.definition ilike '%is_available%'
        and f.definition ilike '%schedule_timezone%'
        and f.definition ilike '%at time zone%'
    ),
    'Existing Thursday times can seed the template without copying UTC as clock time.'

  union all
  select
    'APPLY STRUCTURE',
    'Apply combines each play_date with local_time in the event timezone',
    exists (
      select 1 from function_catalog f
      where f.function_name = 'apply_major_standard_signup_times'
        and f.callable_arguments = 'uuid'
        and f.definition ilike '%play_date%local_time%at time zone%'
        and f.definition ilike '%schedule_timezone%'
    ),
    'Concrete day slots retain canonical timestamptz storage.'

  union all
  select
    'SLOT PROTECTION',
    'Apply checks existing player day choices before replacing/removing slots',
    exists (
      select 1 from function_catalog f
      where f.function_name = 'apply_major_standard_signup_times'
        and f.callable_arguments = 'uuid'
        and f.definition ilike '%major_entry_day_choices%'
        and f.definition ilike '%time_slot_id%'
    ),
    'Selected slots are identified by canonical choice records.'

  union all
  select
    'SLOT PROTECTION',
    'Apply checks room assignments before replacing/removing slots',
    exists (
      select 1 from function_catalog f
      where f.function_name = 'apply_major_standard_signup_times'
        and f.callable_arguments = 'uuid'
        and f.definition ilike '%major_schedule_groups%'
        and f.definition ilike '%time_slot_id%'
    ),
    'Room-linked slots are treated as in use.'

  union all
  select
    'SLOT PROTECTION',
    'In-use superseded slots are disabled and detached instead of deleted',
    exists (
      select 1 from function_catalog f
      where f.function_name = 'apply_major_standard_signup_times'
        and f.callable_arguments = 'uuid'
        and f.definition ilike '%if slot_in_use then%'
        and f.definition ilike '%is_available = false%'
        and f.definition ilike '%standard_signup_time_id = null%'
        and f.definition ilike '%protected_count%'
    ),
    'The protected branch preserves slot identity, selections, and assignments.'

  union all
  select
    'SLOT PROTECTION',
    'Slot deletion is confined to the not-in-use branch',
    exists (
      select 1 from function_catalog f
      where f.function_name = 'apply_major_standard_signup_times'
        and f.callable_arguments = 'uuid'
        and f.definition ilike '%if slot_in_use then%else%delete from public.major_time_slots%'
    ),
    'Structural confirmation that selected/assigned slots do not take the delete path.'
),
summary as (
  select
    count(*) filter (where passed) as passed_count,
    count(*) as total_count,
    case
      when not coalesce((select passed from checks where check_name = 'public.major_standard_signup_times exists'), false)
       and not exists (select 1 from function_catalog) then 'NOT INSTALLED'
      when bool_and(passed) then 'COMPLETE'
      else 'PARTIAL'
    end as overall_status
  from checks
)
select
  0 as display_order,
  'OVERALL'::text as category,
  'Major standard signup-time template installation'::text as check_name,
  s.overall_status = 'COMPLETE' as passed,
  format('%s — %s of %s checks passed', s.overall_status, s.passed_count, s.total_count) as detail
from summary s
union all
select
  1,
  c.category,
  c.check_name,
  c.passed,
  case when c.passed then 'OK — ' || c.detail else 'MISSING OR INCORRECT — ' || c.detail end
from checks c
order by display_order, category, check_name;
