-- READ-ONLY verification for the centralized site-admin authorization foundation.
-- Safe to run in the Supabase SQL editor: this file contains catalog SELECTs only.
-- It does not create, alter, insert, update, delete, grant, revoke, or execute
-- application functions.

with function_object as (
  select
    procedure.oid,
    procedure.prosecdef,
    procedure.provolatile,
    procedure.prorettype,
    procedure.proconfig,
    procedure.proacl,
    procedure.proowner
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'is_current_user_site_admin'
    and pg_catalog.pg_get_function_identity_arguments(procedure.oid) = ''
),
table_object as (
  select
    class.oid,
    class.relrowsecurity,
    class.relacl,
    class.relowner
  from pg_catalog.pg_class as class
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = class.relnamespace
  where namespace.nspname = 'public'
    and class.relname = 'site_admin_users'
    and class.relkind in ('r', 'p')
),
checks as (
  select
    10 as display_order,
    'Admin table exists'::text as check_name,
    (to_regclass('public.site_admin_users') is not null) as passed,
    'Required object: public.site_admin_users'::text as explanation

  union all
  select
    20,
    'Admin table has user_id UUID',
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'site_admin_users'
        and column_name = 'user_id'
        and data_type = 'uuid'
        and is_nullable = 'NO'
    ),
    'user_id must be a required UUID identifying the authorized auth user.'

  union all
  select
    30,
    'user_id is the primary key',
    exists (
      select 1
      from pg_catalog.pg_constraint as constraint_object
      join table_object on table_object.oid = constraint_object.conrelid
      where constraint_object.contype = 'p'
        and constraint_object.conkey = array[
          (
            select attribute.attnum
            from pg_catalog.pg_attribute as attribute
            where attribute.attrelid = table_object.oid
              and attribute.attname = 'user_id'
              and not attribute.attisdropped
          )::smallint
        ]
    ),
    'Prevents the same auth user from being listed more than once.'

  union all
  select
    40,
    'user_id references auth.users with cascade delete',
    exists (
      select 1
      from pg_catalog.pg_constraint as constraint_object
      join table_object on table_object.oid = constraint_object.conrelid
      join pg_catalog.pg_class as referenced_table
        on referenced_table.oid = constraint_object.confrelid
      join pg_catalog.pg_namespace as referenced_schema
        on referenced_schema.oid = referenced_table.relnamespace
      where constraint_object.contype = 'f'
        and referenced_schema.nspname = 'auth'
        and referenced_table.relname = 'users'
        and constraint_object.confdeltype = 'c'
    ),
    'Keeps site-admin membership tied to a real Supabase Auth user.'

  union all
  select
    50,
    'Row Level Security is enabled',
    coalesce((select relrowsecurity from table_object), false),
    'The private admin-membership table must have RLS enabled.'

  union all
  select
    60,
    'Admin table is not directly readable or writable by app roles',
    exists (select 1 from table_object)
      and not exists (
        select 1
        from table_object
        cross join lateral pg_catalog.aclexplode(
          coalesce(table_object.relacl, pg_catalog.acldefault('r', table_object.relowner))
        ) as access_entry
        left join pg_catalog.pg_roles as role_object
          on role_object.oid = access_entry.grantee
        where access_entry.grantee = 0
           or role_object.rolname in ('anon', 'authenticated')
      ),
    'PUBLIC, anon, and authenticated should have no direct table privileges.'

  union all
  select
    70,
    'Authorization function exists with no arguments',
    exists (select 1 from function_object),
    'Required function: public.is_current_user_site_admin()'

  union all
  select
    80,
    'Authorization function returns boolean',
    coalesce(
      (
        select prorettype = 'pg_catalog.bool'::regtype
        from function_object
      ),
      false
    ),
    'Majors security checks require a true/false result.'

  union all
  select
    90,
    'Authorization function is SECURITY DEFINER',
    coalesce((select prosecdef from function_object), false),
    'Allows the function to check the private membership table safely.'

  union all
  select
    100,
    'Authorization function is STABLE',
    coalesce((select provolatile = 's' from function_object), false),
    'Matches the centralized authorization migration definition.'

  union all
  select
    110,
    'Authorization function has an empty fixed search_path',
    coalesce(
      (
        select 'search_path=""' = any(proconfig)
        from function_object
      ),
      false
    ),
    'Required SECURITY DEFINER hardening against unsafe object resolution.'

  union all
  select
    120,
    'Only authenticated receives function execution',
    exists (
      select 1
      from function_object
      cross join lateral pg_catalog.aclexplode(
        coalesce(function_object.proacl, pg_catalog.acldefault('f', function_object.proowner))
      ) as access_entry
      join pg_catalog.pg_roles as role_object
        on role_object.oid = access_entry.grantee
      where role_object.rolname = 'authenticated'
        and access_entry.privilege_type = 'EXECUTE'
    )
    and not exists (
      select 1
      from function_object
      cross join lateral pg_catalog.aclexplode(
        coalesce(function_object.proacl, pg_catalog.acldefault('f', function_object.proowner))
      ) as access_entry
      left join pg_catalog.pg_roles as role_object
        on role_object.oid = access_entry.grantee
      where access_entry.privilege_type = 'EXECUTE'
        and (
          access_entry.grantee = 0
          or role_object.rolname = 'anon'
        )
    ),
    'authenticated should have EXECUTE; PUBLIC and anon should not.'
),
report as (
  select
    0 as display_order,
    'OVERALL RESULT'::text as check_name,
    bool_and(passed) as passed,
    case
      when bool_and(passed)
        then 'READY: centralized site-admin authorization matches the required Majors foundation.'
      else 'NOT READY: one or more required checks failed. Review the rows marked MISSING / INCORRECT before installing Majors SQL.'
    end as explanation
  from checks

  union all
  select display_order, check_name, passed, explanation
  from checks
)
select
  case when passed then 'OK' else 'MISSING / INCORRECT' end as status,
  check_name,
  explanation
from report
order by display_order;
