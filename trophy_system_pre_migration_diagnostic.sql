-- READ ONLY. Run once in the Supabase SQL Editor and export the single Results grid.
-- The result has two columns: section and data (JSONB).

with diagnostic as (
  select 1 as section_order,'01_relevant_table_columns'::text as section,
    coalesce(jsonb_agg(to_jsonb(column_row) order by column_row.table_name,column_row.ordinal_position),'[]'::jsonb) as data
  from (
    select table_schema,table_name,ordinal_position,column_name,data_type,udt_name,is_nullable,column_default
    from information_schema.columns
    where table_schema='public' and table_name in ('player_trophies','player_tracker','players','player_aliases')
  ) as column_row

  union all
  select 2,'02_player_trophies_constraints_and_foreign_keys',
    coalesce(jsonb_agg(to_jsonb(constraint_result) order by constraint_result.constraint_type,constraint_result.constraint_name),'[]'::jsonb)
  from (
    select constraint_row.conname as constraint_name,constraint_row.contype as constraint_type,
      pg_get_constraintdef(constraint_row.oid,true) as definition,
      referenced_namespace.nspname as referenced_schema,referenced_table.relname as referenced_table
    from pg_constraint as constraint_row
    join pg_class as source_table on source_table.oid=constraint_row.conrelid
    join pg_namespace as source_namespace on source_namespace.oid=source_table.relnamespace
    left join pg_class as referenced_table on referenced_table.oid=constraint_row.confrelid
    left join pg_namespace as referenced_namespace on referenced_namespace.oid=referenced_table.relnamespace
    where source_namespace.nspname='public' and source_table.relname='player_trophies'
  ) as constraint_result

  union all
  select 3,'03_player_trophies_indexes',
    coalesce(jsonb_agg(to_jsonb(index_result) order by index_result.indexname),'[]'::jsonb)
  from (
    select schemaname,tablename,indexname,indexdef
    from pg_indexes where schemaname='public' and tablename='player_trophies'
  ) as index_result

  union all
  select 4,'04_player_trophies_rls_and_policies',jsonb_build_object(
    'table_state',coalesce((
      select jsonb_agg(to_jsonb(state_result)) from (
        select namespace.nspname as schema_name,relation.relname as table_name,relation.relrowsecurity,relation.relforcerowsecurity
        from pg_class as relation join pg_namespace as namespace on namespace.oid=relation.relnamespace
        where namespace.nspname='public' and relation.relname='player_trophies'
      ) as state_result
    ),'[]'::jsonb),
    'policies',coalesce((
      select jsonb_agg(to_jsonb(policy_result) order by policy_result.policyname) from (
        select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
        from pg_policies where schemaname='public' and tablename='player_trophies'
      ) as policy_result
    ),'[]'::jsonb)
  )

  union all
  select 5,'05_current_trophy_rows_and_owner_compatibility',
    coalesce(jsonb_agg(trophy_result.data order by trophy_result.created_at nulls last,trophy_result.trophy_id),'[]'::jsonb)
  from (
    select trophy.id as trophy_id,trophy.created_at,
      to_jsonb(trophy)||jsonb_build_object(
        'player_id_exists_in_tracker',tracker.id is not null,'tracker_screen_name',tracker.screen_name,
        'player_id_exists_in_players',player.id is not null,'players_screen_name',player.screen_name,
        'resolved_canonical_player_id',public.resolve_canonical_player_id(player.id)
      ) as data
    from public.player_trophies as trophy
    left join public.player_tracker as tracker on tracker.id=trophy.player_id
    left join public.players as player on player.id=trophy.player_id
  ) as trophy_result

  union all
  select 6,'06_trophy_row_id_relationship_checks',
    coalesce(jsonb_agg(to_jsonb(id_result) order by id_result.trophy_id),'[]'::jsonb)
  from (
    select trophy.id as trophy_id,trophy.player_id,trophy.player_name,
      tracker.id is not null as trophy_id_equals_tracker_id,tracker.screen_name as tracker_name_at_trophy_id,
      player.id is not null as trophy_id_equals_player_id,player.screen_name as player_name_at_trophy_id
    from public.player_trophies as trophy
    left join public.player_tracker as tracker on tracker.id=trophy.id
    left join public.players as player on player.id=trophy.id
  ) as id_result

  union all
  select 7,'07_player_tracker_inventory_and_canonical_overlap',
    coalesce(jsonb_agg(to_jsonb(tracker_result) order by tracker_result.screen_name,tracker_result.tracker_id),'[]'::jsonb)
  from (
    select tracker.id as tracker_id,tracker.screen_name,tracker.discord_id,tracker.status,tracker.cup_tier,
      player.id as same_uuid_player_id,player.screen_name as same_uuid_player_name
    from public.player_tracker as tracker left join public.players as player on player.id=tracker.id
  ) as tracker_result

  union all
  select 8,'08_verified_alias_matches_for_trophies',
    coalesce(jsonb_agg(to_jsonb(alias_result) order by alias_result.trophy_id,alias_result.canonical_player_id,alias_result.alias),'[]'::jsonb)
  from (
    select trophy.id as trophy_id,trophy.player_name as trophy_player_name,
      alias.player_id as alias_player_id,alias.alias,alias.verified,
      public.resolve_canonical_player_id(alias.player_id) as canonical_player_id,canonical.screen_name as canonical_screen_name
    from public.player_trophies as trophy
    join public.player_aliases as alias
      on regexp_replace(lower(alias.alias),'[^a-z0-9]','','g')=regexp_replace(lower(trophy.player_name),'[^a-z0-9]','','g')
    left join public.players as canonical on canonical.id=public.resolve_canonical_player_id(alias.player_id)
    where alias.verified
  ) as alias_result

  union all
  select 9,'09_verified_canonical_candidate_counts',
    coalesce(jsonb_agg(to_jsonb(candidate_result) order by candidate_result.trophy_id),'[]'::jsonb)
  from (
    select trophy.id as trophy_id,trophy.player_name,
      count(distinct public.resolve_canonical_player_id(alias.player_id)) as verified_canonical_candidate_count,
      array_agg(distinct public.resolve_canonical_player_id(alias.player_id)) filter(where alias.player_id is not null) as candidate_ids
    from public.player_trophies as trophy
    left join public.player_aliases as alias
      on alias.verified and regexp_replace(lower(alias.alias),'[^a-z0-9]','','g')=regexp_replace(lower(trophy.player_name),'[^a-z0-9]','','g')
    group by trophy.id,trophy.player_name
  ) as candidate_result

  union all
  select 10,'10_relevant_functions_and_rpcs',
    coalesce(jsonb_agg(to_jsonb(routine_result) order by routine_result.routine_name,routine_result.arguments),'[]'::jsonb)
  from (
    select routine.schema_name,routine.routine_name,routine.arguments,routine.definition
    from (
      select namespace.nspname as schema_name,procedure.proname as routine_name,
        pg_get_function_identity_arguments(procedure.oid) as arguments,
        case when procedure.prokind in ('f','p') then pg_get_functiondef(procedure.oid) end as definition
      from pg_proc as procedure join pg_namespace as namespace on namespace.oid=procedure.pronamespace
      where namespace.nspname='public' and procedure.prokind in ('f','p')
    ) as routine
    where routine.definition ilike '%player_trophies%' or routine.definition ilike '%player_tracker%'
  ) as routine_result

  union all
  select 11,'11_trophy_storage_bucket_and_policies',jsonb_build_object(
    'buckets',coalesce((
      select jsonb_agg(to_jsonb(bucket_result) order by bucket_result.id) from (
        select id,name,public,file_size_limit,allowed_mime_types from storage.buckets where id='trophy-images'
      ) as bucket_result
    ),'[]'::jsonb),
    'policies',coalesce((
      select jsonb_agg(to_jsonb(storage_policy) order by storage_policy.policyname) from (
        select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
        from pg_policies where schemaname='storage' and tablename='objects'
          and (coalesce(qual,'') ilike '%trophy-images%' or coalesce(with_check,'') ilike '%trophy-images%')
      ) as storage_policy
    ),'[]'::jsonb)
  )
)
select section,data from diagnostic order by section_order;
