-- READ ONLY. Run after all_time_identity_merge_integration.sql.
-- This is the optional All-Time extension to the central classified-reference audit.
with expected_all_time_player_columns(table_name, column_name, treatment) as (
  values
    ('all_time_record_observations', 'player_id', 'historical observation preserved; ownership canonicalized on merge'),
    ('all_time_best_records', 'player_id', 'derived individual best reconciled to one canonical row per course'),
    ('all_time_combined_observations', 'player_id', 'historical combined observation preserved; ownership canonicalized on merge'),
    ('all_time_combined_best_records', 'player_id', 'derived official combined best reconciled to one canonical row per base map')
), actual_all_time_player_foreign_keys as (
  select source_table.relname::text as table_name,
         source_column.attname::text as column_name,
         constraint_row.conname::text as constraint_name
  from pg_constraint as constraint_row
  join pg_class as source_table on source_table.oid = constraint_row.conrelid
  join pg_namespace as source_namespace on source_namespace.oid = source_table.relnamespace
  join lateral unnest(constraint_row.conkey) with ordinality as source_key(attnum, position) on true
  join lateral unnest(constraint_row.confkey) with ordinality as target_key(attnum, position)
    on target_key.position = source_key.position
  join pg_attribute as source_column
    on source_column.attrelid = source_table.oid and source_column.attnum = source_key.attnum
  join pg_attribute as target_column
    on target_column.attrelid = constraint_row.confrelid and target_column.attnum = target_key.attnum
  where constraint_row.contype = 'f'
    and source_namespace.nspname = 'public'
    and constraint_row.confrelid = 'public.players'::regclass
    and target_column.attname = 'id'
    and source_table.relname like 'all_time_%'
), classified as (
  select expected.*,
         actual.constraint_name,
         case when actual.table_name is null then 'BLOCK' else 'PASS' end as status
  from expected_all_time_player_columns as expected
  left join actual_all_time_player_foreign_keys as actual
    using (table_name, column_name)
), unexpected as (
  select actual.*
  from actual_all_time_player_foreign_keys as actual
  left join expected_all_time_player_columns as expected
    using (table_name, column_name)
  where expected.table_name is null
)
select table_name, column_name, treatment, constraint_name, status
from classified
union all
select table_name, column_name, 'unclassified All-Time player reference', constraint_name, 'BLOCK'
from unexpected
order by table_name, column_name;

-- Expected after every completed merge: zero rows from both checks.
select public.resolve_canonical_player_id(best.player_id) as canonical_player_id,
       best.course_id, count(*) as duplicate_best_rows
from public.all_time_best_records as best
group by public.resolve_canonical_player_id(best.player_id), best.course_id
having count(*) > 1;

select public.resolve_canonical_player_id(best.player_id) as canonical_player_id,
       best.base_map, count(*) as duplicate_combined_best_rows
from public.all_time_combined_best_records as best
group by public.resolve_canonical_player_id(best.player_id), best.base_map
having count(*) > 1;
