-- READ-ONLY diagnostic for Major player-scoring function signatures.
-- Catalog SELECTs only: no application functions are invoked.
with expected_functions(function_name, expected_argument_types) as (
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
catalog_functions as (
  select
    procedure_info.oid,
    procedure_info.proname as function_name,
    pg_catalog.oidvectortypes(procedure_info.proargtypes) as callable_argument_types,
    pg_catalog.pg_get_function_identity_arguments(procedure_info.oid) as declared_identity_arguments,
    pg_catalog.pg_get_function_result(procedure_info.oid) as return_type,
    procedure_info.prosecdef as is_security_definer,
    procedure_info.proconfig as function_configuration,
    procedure_info.proacl as access_control_list,
    pg_catalog.pg_get_userbyid(procedure_info.proowner) as function_owner
  from pg_catalog.pg_proc procedure_info
  join pg_catalog.pg_namespace namespace
    on namespace.oid = procedure_info.pronamespace
  where namespace.nspname = 'public'
    and procedure_info.proname in (
      select expected.function_name
      from expected_functions expected
    )
),
diagnostic_rows as (
  select
    expected.function_name,
    expected.expected_argument_types,
    catalog.callable_argument_types,
    catalog.declared_identity_arguments,
    catalog.return_type,
    catalog.oid is not null as function_exists,
    coalesce(catalog.callable_argument_types = expected.expected_argument_types, false) as expected_signature_exists,
    catalog.is_security_definer,
    coalesce(array_to_string(catalog.function_configuration, ', '), 'No per-function configuration') as function_configuration,
    coalesce(catalog.access_control_list::text, 'NULL (default privileges)') as execution_privileges,
    catalog.function_owner
  from expected_functions expected
  left join catalog_functions catalog
    on catalog.function_name = expected.function_name
)
select
  function_name,
  expected_argument_types,
  callable_argument_types as actual_callable_signature,
  declared_identity_arguments as actual_declared_signature,
  return_type,
  function_exists,
  expected_signature_exists,
  is_security_definer,
  function_configuration as search_path_and_other_configuration,
  execution_privileges,
  function_owner
from diagnostic_rows
order by function_name, actual_callable_signature nulls first;

-- Simple summary for non-programmers.
with expected_functions(function_name, expected_argument_types) as (
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
signature_checks as (
  select
    expected.function_name,
    expected.expected_argument_types,
    exists (
      select 1
      from pg_catalog.pg_proc procedure_info
      join pg_catalog.pg_namespace namespace
        on namespace.oid = procedure_info.pronamespace
      where namespace.nspname = 'public'
        and procedure_info.proname = expected.function_name
        and pg_catalog.oidvectortypes(procedure_info.proargtypes) = expected.expected_argument_types
    ) as expected_signature_exists
  from expected_functions expected
)
select
  case
    when bool_and(expected_signature_exists) then 'ALL EXPECTED FUNCTIONS EXIST'
    when bool_or(expected_signature_exists) then 'SOME EXPECTED FUNCTIONS ARE MISSING'
    else 'NO EXPECTED FUNCTIONS EXIST'
  end as diagnostic_status,
  count(*) filter (where expected_signature_exists) || ' of ' || count(*) || ' expected signatures found' as result,
  coalesce(
    string_agg(
      function_name || '(' || expected_argument_types || ')',
      ', ' order by function_name
    ) filter (where not expected_signature_exists),
    'None'
  ) as missing_expected_signatures
from signature_checks;
