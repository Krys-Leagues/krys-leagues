-- Read-only production verification for major_player_room_roster.sql.
-- This statement inspects catalog metadata only and performs no mutations.
with
schedule_function as (
  select
    p.oid,
    p.prosecdef,
    p.proconfig,
    p.proacl,
    p.proowner,
    pg_catalog.pg_get_functiondef(p.oid) as definition
  from pg_catalog.pg_proc p
  where p.oid = pg_catalog.to_regprocedure('public.get_my_major_signup_schedule(uuid)')
),
contract_check as (
  select exists (
    select 1
    from schedule_function f
    where f.definition ilike '%' || quote_literal('room_roster') || '%'
      and f.definition ilike '%' || quote_literal('player_id') || '%'
      and f.definition ilike '%' || quote_literal('player_screen_name_snapshot') || '%'
      and f.definition ilike '%room_member.group_id = g.id%'
  ) as passed
),
privacy_check as (
  select exists (
    select 1
    from schedule_function f
    where f.definition ilike '%g.is_published%'
      and f.definition ilike '%weekend_status_published_at is not null%'
      and f.definition ilike '%gm.entry_id = e.id%'
      and f.definition ilike '%e.player_id = matched_player_id%'
  ) as passed
),
security_check as (
  select exists (
    select 1
    from schedule_function f
    where f.prosecdef
      and coalesce(f.proconfig, array[]::text[]) && array['search_path=', 'search_path=""']
  ) as passed
),
execution_check as (
  select exists (
    select 1
    from schedule_function f
    where pg_catalog.has_function_privilege('authenticated', f.oid, 'EXECUTE')
      and not pg_catalog.has_function_privilege('anon', f.oid, 'EXECUTE')
      and not exists (
        select 1
        from pg_catalog.aclexplode(coalesce(f.proacl, pg_catalog.acldefault('f', f.proowner))) acl
        where acl.grantee = 0
          and acl.privilege_type = 'EXECUTE'
      )
  ) as passed
),
room_tables as (
  select
    t.relname,
    t.relrowsecurity,
    not pg_catalog.has_table_privilege('anon', t.oid, 'SELECT') as anon_blocked,
    exists (
      select 1
      from pg_catalog.pg_policy p
      where p.polrelid = t.oid
        and (
          coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '') ilike '%is_current_user_site_admin%'
          or coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '') ilike '%is_current_user_site_admin%'
        )
    ) as admin_policy_exists
  from pg_catalog.pg_class t
  join pg_catalog.pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname in ('major_schedule_groups', 'major_schedule_group_members')
),
tables_check as (
  select
    count(*) = 2
    and bool_and(relrowsecurity)
    and bool_and(anon_blocked)
    and bool_and(admin_policy_exists) as passed
  from room_tables
),
checks as (
  select 'Schedule RPC returns canonical room-roster entries'::text as check_name,
         (select passed from contract_check) as passed
  union all
  select 'Only the player own published room follows the weekend reveal gate',
         (select passed from privacy_check)
  union all
  select 'Schedule RPC is SECURITY DEFINER with an empty search path',
         (select passed from security_check)
  union all
  select 'Schedule RPC execution is authenticated-only',
         (select passed from execution_check)
  union all
  select 'Room tables retain RLS and site-admin-only policies',
         (select passed from tables_check)
),
overall as (
  select case
    when not (select passed from contract_check) then 'NOT INSTALLED'
    when bool_and(passed) then 'COMPLETE'
    else 'PARTIAL'
  end as status
  from checks
)
select
  0 as display_order,
  'OVERALL STATUS'::text as item,
  o.status as result,
  'COMPLETE means the protected player-room roster contract and every security check passed.'::text as explanation
from overall o
union all
select
  row_number() over (order by c.check_name)::integer,
  c.check_name,
  case when c.passed then 'OK' else 'MISSING OR INCORRECT' end,
  case
    when c.passed then 'This requirement is ready.'
    else 'Review this item before exposing published room rosters to players.'
  end
from checks c
order by display_order, item;
