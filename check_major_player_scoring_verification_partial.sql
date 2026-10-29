-- READ-ONLY production verification for major_player_scoring_verification.sql.
-- This file uses catalog SELECTs only and does not call application RPCs.
with expected_tables(object_name) as (
  values
    ('major_player_scorecards'),
    ('major_player_scorecard_holes'),
    ('major_scorecard_audit_log'),
    ('major_round_standing_snapshots')
),
expected_columns(object_name) as (
  values
    ('scoring_entry_open'),
    ('scoring_finalized_at'),
    ('scoring_finalized_by')
),
expected_functions(object_name, identity_arguments) as (
  values
    ('current_major_player_id', ''),
    ('set_major_round_scoring_state', 'uuid, boolean'),
    ('get_my_major_scorecards', 'uuid'),
    ('save_my_major_scorecard', 'uuid, jsonb'),
    ('submit_my_major_scorecard', 'uuid'),
    ('verify_major_scorecard', 'uuid, text'),
    ('reopen_major_scorecard', 'uuid, text'),
    ('finalize_major_scoring_round', 'uuid'),
    ('get_public_major_live_results', 'uuid'),
    ('get_public_major_hole_in_one_history', ''),
    ('get_major_scorecard_verification_queue', 'uuid')
),
expected_policies(table_name, policy_name) as (
  values
    ('major_player_scorecards', 'Site admins read Major player scorecards'),
    ('major_player_scorecard_holes', 'Site admins read Major player holes')
),
table_checks as (
  select
    'TABLE'::text as object_type,
    expected.object_name,
    exists (
      select 1
      from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = expected.object_name
        and relation.relkind in ('r', 'p')
    ) as installed
  from expected_tables expected
),
column_checks as (
  select
    'PLAY-DAY COLUMN'::text as object_type,
    expected.object_name,
    exists (
      select 1
      from information_schema.columns column_info
      where column_info.table_schema = 'public'
        and column_info.table_name = 'major_play_days'
        and column_info.column_name = expected.object_name
    ) as installed
  from expected_columns expected
),
function_checks as (
  select
    'FUNCTION'::text as object_type,
    expected.object_name || '(' || expected.identity_arguments || ')' as object_name,
    exists (
      select 1
      from pg_catalog.pg_proc procedure_info
      join pg_catalog.pg_namespace namespace on namespace.oid = procedure_info.pronamespace
      where namespace.nspname = 'public'
        and procedure_info.proname = expected.object_name
        -- Compare argument TYPES only. pg_get_function_identity_arguments()
        -- includes declared parameter names (for example "p_play_day_id uuid"),
        -- while this checker's expected signatures intentionally use the
        -- callable type signature (for example "uuid").
        and pg_catalog.oidvectortypes(procedure_info.proargtypes) = expected.identity_arguments
    ) as installed
  from expected_functions expected
),
policy_checks as (
  select
    'RLS POLICY'::text as object_type,
    expected.table_name || ' → ' || expected.policy_name as object_name,
    exists (
      select 1
      from pg_catalog.pg_policy policy_info
      join pg_catalog.pg_class relation on relation.oid = policy_info.polrelid
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = expected.table_name
        and policy_info.polname = expected.policy_name
    ) as installed
  from expected_policies expected
),
rls_checks as (
  select
    'RLS ENABLED'::text as object_type,
    expected.object_name,
    coalesce((
      select relation.relrowsecurity
      from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = expected.object_name
        and relation.relkind in ('r', 'p')
    ), false) as installed
  from expected_tables expected
),
all_checks as (
  select * from table_checks
  union all select * from column_checks
  union all select * from function_checks
  union all select * from policy_checks
  union all select * from rls_checks
),
overall as (
  select
    case
      when count(*) filter (where installed) = 0 then 'NOT INSTALLED'
      when bool_and(installed) then 'COMPLETE'
      else 'PARTIAL'
    end as installation_status,
    count(*) filter (where installed) as checks_passed,
    count(*) as checks_expected
  from all_checks
)
select
  0 as display_order,
  'OVERALL STATUS' as object_type,
  overall.installation_status as object_name,
  overall.installation_status = 'COMPLETE' as installed,
  overall.checks_passed || ' of ' || overall.checks_expected || ' checks passed' as explanation
from overall
union all
select
  1 as display_order,
  checks.object_type,
  checks.object_name,
  checks.installed,
  case when checks.installed then 'Present' else 'Missing' end as explanation
from all_checks checks
order by display_order, object_type, object_name;
