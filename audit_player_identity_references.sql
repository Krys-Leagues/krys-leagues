-- READ ONLY. Run after player_identity_foundation.sql and player_duplicate_review.sql.
-- Run it before installing/enabling the merge RPC and before merging any players.

-- A. Foreign keys that directly reference public.players(id).
select
  source_namespace.nspname as table_schema,
  source_table.relname as table_name,
  source_column.attname as column_name,
  constraint_row.conname as constraint_name,
  pg_get_constraintdef(constraint_row.oid) as definition
from pg_constraint as constraint_row
join pg_class as source_table on source_table.oid = constraint_row.conrelid
join pg_namespace as source_namespace on source_namespace.oid = source_table.relnamespace
join lateral unnest(constraint_row.conkey) with ordinality as source_key(attnum, position) on true
join pg_attribute as source_column
  on source_column.attrelid = source_table.oid and source_column.attnum = source_key.attnum
where constraint_row.contype = 'f'
  and constraint_row.confrelid = 'public.players'::regclass
order by source_namespace.nspname, source_table.relname, source_column.attname;

-- B. Every public column whose name suggests a player UUID reference, including non-FK legacy columns.
select table_schema, table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and (column_name = 'player_id'
       or column_name like 'player%\_id' escape '\'
       or column_name like '%\_player_id' escape '\')
order by table_name, ordinal_position;

-- C. Existing canonical links that are missing a source/destination or point to themselves.
select link.historical_player_id, link.canonical_player_id,
       historical.screen_name as historical_name,
       canonical.screen_name as canonical_name
from public.player_identity_links as link
left join public.players as historical on historical.id = link.historical_player_id
left join public.players as canonical on canonical.id = link.canonical_player_id
where historical.id is null
   or canonical.id is null
   or link.historical_player_id = link.canonical_player_id;

-- D. Canonical links whose destination is itself retired (chains should be flattened).
select child.historical_player_id,
       child.canonical_player_id as intermediate_player_id,
       parent.canonical_player_id as final_player_id
from public.player_identity_links as child
join public.player_identity_links as parent
  on parent.historical_player_id = child.canonical_player_id;

-- E. Circular canonical-link paths. Expected: zero rows.
with recursive paths as (
  select link.historical_player_id as start_id,
         link.canonical_player_id as current_id,
         array[link.historical_player_id, link.canonical_player_id]::uuid[] as visited,
         false as cycle
  from public.player_identity_links as link
  union all
  select path.start_id,
         link.canonical_player_id,
         path.visited || link.canonical_player_id,
         link.canonical_player_id = any(path.visited)
  from paths as path
  join public.player_identity_links as link
    on link.historical_player_id = path.current_id
  where not path.cycle
)
select start_id, current_id, visited
from paths
where cycle;

-- F. Retired mapped players that remain active/selectable. Expected: zero rows after merges.
select player.id, player.screen_name, player.active, player.status, link.canonical_player_id
from public.player_identity_links as link
join public.players as player on player.id = link.historical_player_id
where player.active is not false;

-- G. Discord conflicts inside a canonical identity family. Expected: zero rows.
select public.resolve_canonical_player_id(player.id) as canonical_player_id,
       array_agg(player.id order by player.id) as identity_player_ids,
       count(distinct nullif(btrim(player.discord_id), '')) as distinct_discord_ids
from public.players as player
where nullif(btrim(player.discord_id), '') is not null
group by public.resolve_canonical_player_id(player.id)
having count(distinct nullif(btrim(player.discord_id), '')) > 1;

-- H. Candidate-pair diagnostic reproduced directly for SQL Editor use.
-- This intentionally does NOT execute the auth-protected application RPC.
with canonical_players as (
  select
    player.id,
    player.screen_name,
    nullif(btrim(player.discord_id), '') as discord_id,
    lower(btrim(player.screen_name)) as casefold_name,
    lower(regexp_replace(coalesce(player.screen_name, ''), '[^[:alnum:]]+', '', 'g')) as normalized_name
  from public.players as player
  where not exists (
    select 1
    from public.player_identity_links as link
    where link.historical_player_id = player.id
  )
), candidate_pairs as (
  select
    left_player.id as player1_id,
    left_player.screen_name as player1_screen_name,
    right_player.id as player2_id,
    right_player.screen_name as player2_screen_name,
    case
      when left_player.discord_id is not null
       and left_player.discord_id = right_player.discord_id then 100
      when left_player.casefold_name = right_player.casefold_name then 95
      when left_player.normalized_name <> ''
       and left_player.normalized_name = right_player.normalized_name then 90
      when length(left_player.normalized_name) >= 4
       and length(right_player.normalized_name) >= 4
       and abs(length(left_player.normalized_name) - length(right_player.normalized_name)) <= 3
       and (left_player.normalized_name like right_player.normalized_name || '%'
            or right_player.normalized_name like left_player.normalized_name || '%') then 60
      else 0
    end as confidence,
    array_remove(array[
      case when left_player.discord_id is not null
             and left_player.discord_id = right_player.discord_id
           then 'Same Discord identity' end,
      case when left_player.casefold_name = right_player.casefold_name
           then 'Same name ignoring capitalization/outer whitespace' end,
      case when left_player.normalized_name <> ''
             and left_player.normalized_name = right_player.normalized_name
           then 'Same normalized name' end,
      case when left_player.normalized_name <> right_player.normalized_name
             and length(left_player.normalized_name) >= 4
             and length(right_player.normalized_name) >= 4
             and abs(length(left_player.normalized_name) - length(right_player.normalized_name)) <= 3
             and (left_player.normalized_name like right_player.normalized_name || '%'
                  or right_player.normalized_name like left_player.normalized_name || '%')
           then 'Possible close name variant' end
    ], null)::text[] as evidence,
    md5(concat_ws('|',
      left_player.id::text,
      right_player.id::text,
      coalesce(left_player.screen_name, ''),
      coalesce(right_player.screen_name, ''),
      coalesce(left_player.discord_id, ''),
      coalesce(right_player.discord_id, '')
    )) as evidence_signature
  from canonical_players as left_player
  join canonical_players as right_player
    on right_player.id > left_player.id
)
select
  candidate.player1_id,
  candidate.player1_screen_name,
  candidate.player2_id,
  candidate.player2_screen_name,
  candidate.confidence,
  candidate.evidence
from candidate_pairs as candidate
where candidate.confidence > 0
  and not exists (
    select 1
    from public.player_identity_not_matches as rejection
    where rejection.player1_id = candidate.player1_id
      and rejection.player2_id = candidate.player2_id
      and rejection.evidence_signature = candidate.evidence_signature
  )
order by candidate.confidence desc,
         candidate.player1_screen_name,
         candidate.player2_screen_name;

-- I. Approved frozen history where more than one UUID in one canonical family appears
-- in the same scorecard. Such a family must be resolved manually before merging.
select 'stroke' as league_type, entry.scorecard_id,
       public.resolve_canonical_player_id(entry.player_id) as canonical_player_id,
       array_agg(entry.player_id order by entry.player_id) as historical_player_ids
from public.stroke_final_scorecard_entries as entry
join public.stroke_final_scorecards as card on card.id = entry.scorecard_id
where card.status = 'approved'
group by entry.scorecard_id, public.resolve_canonical_player_id(entry.player_id)
having count(distinct entry.player_id) > 1
union all
select 'match', entry.scorecard_id,
       public.resolve_canonical_player_id(entry.player_id),
       array_agg(entry.player_id order by entry.player_id)
from public.match_final_scorecard_entries as entry
join public.match_final_scorecards as card on card.id = entry.scorecard_id
where card.status = 'approved'
group by entry.scorecard_id, public.resolve_canonical_player_id(entry.player_id)
having count(distinct entry.player_id) > 1
union all
select 'pyp', entry.scorecard_id,
       public.resolve_canonical_player_id(entry.player_id),
       array_agg(entry.player_id order by entry.player_id)
from public.pyp_final_scorecard_entries as entry
join public.pyp_final_scorecards as card on card.id = entry.scorecard_id
where card.status = 'approved'
group by entry.scorecard_id, public.resolve_canonical_player_id(entry.player_id)
having count(distinct entry.player_id) > 1;

-- J. Reference counts by identity family for tomorrow's merge review.
select
  player.id,
  player.screen_name,
  public.resolve_canonical_player_id(player.id) as canonical_player_id,
  ((select count(*) from public.results as result
    where result.player1_id = player.id or result.player2_id = player.id)
   + (select count(*) from public.pyp_managed_results as result
      where result.home_player_id = player.id or result.away_player_id = player.id)) as results_count,
  (select count(*) from public.schedule as fixture
   where fixture.player1_id = player.id or fixture.player2_id = player.id
      or fixture.pyp_home_player_id = player.id or fixture.pyp_away_player_id = player.id) as schedule_count,
  (select count(*) from public.player_league_memberships as membership
   where membership.player_id = player.id) as membership_count,
  (select count(*) from public.player_tournament_entries as entry
   where entry.player_id = player.id) as tournament_count,
  (select count(*) from public.player_trophies as trophy
   where trophy.player_id = player.id) as trophy_count
from public.players as player
order by player.screen_name, player.id;

-- K. FINAL CONSOLIDATED INSTALLATION-SAFETY SUMMARY.
-- Export THIS final result set for review before installing player_identity_merge.sql.
with recursive
expected_player_columns(table_name, column_name, treatment) as (
  values
    ('discord_members', 'player_id', 'canonical identity synchronization'),
    ('player_aliases', 'player_id', 'canonical alias ownership'),
    ('player_identity_links', 'historical_player_id', 'canonical identity infrastructure'),
    ('player_identity_links', 'canonical_player_id', 'canonical identity infrastructure'),
    ('player_identity_not_matches', 'player1_id', 'identity review infrastructure'),
    ('player_identity_not_matches', 'player2_id', 'identity review infrastructure'),
    ('results', 'player1_id', 'historical/live reference resolved canonically on read'),
    ('results', 'player2_id', 'historical/live reference resolved canonically on read'),
    ('schedule', 'player1_id', 'historical/live reference resolved canonically on read'),
    ('schedule', 'player2_id', 'historical/live reference resolved canonically on read'),
    ('schedule', 'pyp_home_player_id', 'historical/live reference resolved canonically on read'),
    ('schedule', 'pyp_away_player_id', 'historical/live reference resolved canonically on read'),
    ('matches', 'player1_id', 'legacy historical reference retained'),
    ('matches', 'player2_id', 'legacy historical reference retained'),
    ('season_standings', 'player_id', 'historical/live reference resolved canonically on read'),
    ('player_league_memberships', 'player_id', 'historical membership retained'),
    ('player_tournament_entries', 'player_id', 'historical tournament entry retained'),
    ('player_trophies', 'player_id', 'historical trophy retained and combined on profile'),
    ('stroke_division_roster_slots', 'player_id', 'managed roster; current assignments block merge'),
    ('match_division_roster_slots', 'player_id', 'managed roster; current assignments block merge'),
    ('pyp_division_roster_slots', 'player_id', 'managed roster; current assignments block merge'),
    ('stroke_final_scorecard_entries', 'player_id', 'approved frozen history retained'),
    ('match_final_scorecard_entries', 'player_id', 'approved frozen history retained'),
    ('pyp_final_scorecard_entries', 'player_id', 'approved frozen history retained'),
    ('pyp_final_scorecard_fixture_details', 'player_id', 'approved frozen history retained'),
    ('pyp_final_scorecard_fixture_details', 'opponent_player_id', 'approved frozen history retained'),
    ('stroke_final_scorecard_player_decisions', 'player_id', 'transition reference retained with frozen source'),
    ('match_final_scorecard_player_decisions', 'player_id', 'transition reference retained with frozen source'),
    ('pyp_final_scorecard_player_decisions', 'player_id', 'transition reference retained with frozen source'),
    ('pyp_managed_results', 'home_player_id', 'managed historical result retained'),
    ('pyp_managed_results', 'away_player_id', 'managed historical result retained'),
    ('pyp_managed_results', 'winner_player_id', 'managed historical result retained'),
    ('bracket_results', 'player_id', 'legacy tournament history retained'),
    ('combined_course_records', 'player_id', 'record reference retained and canonicalized by future records work'),
    ('handicap_differentials', 'player_id', 'frozen handicap calculation history; canonicalize on read'),
    ('handicap_index', 'player_id', 'derived handicap state; canonicalize identity family on read'),
    ('handicap_rounds', 'player_id', 'frozen handicap round history; canonicalize on read'),
    ('historical_league_results', 'player_id', 'frozen imported league history; canonicalize on read'),
    ('historical_stroke_standings', 'player_id', 'frozen imported Stroke history; canonicalize on merge'),
    ('import_rows', 'matched_player_id', 'noncanonical import-review support reference'),
    ('import_rows', 'suggested_player_id', 'noncanonical import-review support reference'),
    ('kwt_raw_scores', 'player_id', 'noncanonical raw-import support reference'),
    ('player_career_events', 'player_id', 'frozen career-event history; canonicalize on read'),
    ('player_community_badges', 'player_id', 'historical badge ownership; canonicalize on read'),
    ('player_leagues', 'player_id', 'legacy league relationship; canonicalize on read'),
    ('player_waitlist', 'player_id', 'noncanonical registration-support reference; waitlist identity remains its own row'),
    ('scores', 'player_id', 'historical competition record; canonicalize on read'),
    ('scores', 'opponent_id', 'historical competition opponent; canonicalize on read'),
    ('single_course_records', 'player_id', 'historical record ownership; canonicalize on read'),
    ('all_time_record_observations', 'player_id', 'historical observation preserved; ownership canonicalized on merge'),
    ('all_time_best_records', 'player_id', 'derived individual best reconciled to one canonical row per course'),
    ('all_time_combined_observations', 'player_id', 'historical combined observation preserved; ownership canonicalized on merge'),
    ('all_time_combined_best_records', 'player_id', 'derived official combined best reconciled to one canonical row per base map'),
    ('major_entries', 'player_id', 'current Major registration canonicalized; completed/cancelled event history retained'),
    ('major_scoring_participants', 'player_id', 'active Major scoring participation canonicalized; inactive session history retained')
),
actual_player_foreign_keys as (
  select
    source_table.relname::text as table_name,
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
),
unexpected_foreign_keys as (
  select actual.*
  from actual_player_foreign_keys as actual
  left join expected_player_columns as expected
    on expected.table_name = actual.table_name
   and expected.column_name = actual.column_name
  where expected.table_name is null
),
player_like_columns as (
  select column_row.table_name::text,
         column_row.column_name::text,
         column_row.data_type::text
  from information_schema.columns as column_row
  where column_row.table_schema = 'public'
    and (column_row.column_name = 'player_id'
         or column_row.column_name like 'player%\_id' escape '\'
         or column_row.column_name like '%\_player_id' escape '\')
),
unclassified_player_columns as (
  select actual.*
  from player_like_columns as actual
  left join expected_player_columns as expected
    on expected.table_name = actual.table_name
   and expected.column_name = actual.column_name
  where expected.table_name is null
),
broken_links as (
  select link.historical_player_id, link.canonical_player_id
  from public.player_identity_links as link
  left join public.players as historical on historical.id = link.historical_player_id
  left join public.players as canonical on canonical.id = link.canonical_player_id
  where historical.id is null
     or canonical.id is null
     or link.historical_player_id = link.canonical_player_id
),
recursive_identity_paths as (
  select link.historical_player_id as start_id,
         link.canonical_player_id as current_id,
         array[link.historical_player_id, link.canonical_player_id]::uuid[] as visited,
         false as cycle
  from public.player_identity_links as link
  union all
  select path.start_id,
         link.canonical_player_id,
         path.visited || link.canonical_player_id,
         link.canonical_player_id = any(path.visited)
  from recursive_identity_paths as path
  join public.player_identity_links as link
    on link.historical_player_id = path.current_id
  where not path.cycle
),
identity_cycles as (
  select start_id, current_id
  from recursive_identity_paths
  where cycle
),
required_managed_columns(table_name, column_name) as (
  values
    ('players', 'id'),
    ('players', 'screen_name'),
    ('players', 'discord_id'),
    ('players', 'discord_name'),
    ('players', 'discord_username'),
    ('players', 'active'),
    ('players', 'status'),
    ('player_aliases', 'player_id'),
    ('player_aliases', 'alias'),
    ('player_aliases', 'normalized_alias'),
    ('player_aliases', 'source'),
    ('player_aliases', 'verified'),
    ('discord_members', 'discord_id'),
    ('discord_members', 'player_id'),
    ('stroke_division_roster_slots', 'player_id'),
    ('stroke_division_roster_slots', 'player_screen_name'),
    ('match_division_roster_slots', 'player_id'),
    ('match_division_roster_slots', 'player_screen_name'),
    ('pyp_division_roster_slots', 'player_id'),
    ('pyp_division_roster_slots', 'player_screen_name'),
    ('schedule', 'player1_id'),
    ('schedule', 'player2_id'),
    ('schedule', 'pyp_home_player_id'),
    ('schedule', 'pyp_away_player_id')
),
missing_managed_columns as (
  select required.*
  from required_managed_columns as required
  left join information_schema.columns as actual
    on actual.table_schema = 'public'
   and actual.table_name = required.table_name
   and actual.column_name = required.column_name
  where actual.column_name is null
),
actual_alias_columns as (
  select column_row.column_name::text,
         column_row.data_type::text,
         column_row.is_nullable::text
  from information_schema.columns as column_row
  where column_row.table_schema = 'public'
    and column_row.table_name = 'player_aliases'
),
alias_exact_duplicates as (
  select alias_row.player_id, alias_row.alias, count(*) as duplicate_count
  from public.player_aliases as alias_row
  group by alias_row.player_id, alias_row.alias
  having count(*) > 1
),
alias_index_keys as (
  select
    index_definition.indexrelid,
    index_row.relname::text as index_name,
    index_definition.indisunique,
    array_agg(pg_get_indexdef(index_definition.indexrelid, key_position.position, true)
              order by key_position.position)::text[] as key_columns,
    pg_get_indexdef(index_definition.indexrelid)::text as definition
  from pg_index as index_definition
  join pg_class as table_row
    on table_row.oid = index_definition.indrelid
  join pg_namespace as namespace_row
    on namespace_row.oid = table_row.relnamespace
  join pg_class as index_row
    on index_row.oid = index_definition.indexrelid
  cross join lateral generate_series(1, index_definition.indnkeyatts) as key_position(position)
  where namespace_row.nspname = 'public'
    and table_row.relname = 'player_aliases'
  group by index_definition.indexrelid, index_row.relname, index_definition.indisunique
),
incompatible_alias_indexes as (
  select alias_index.*
  from alias_index_keys as alias_index
  where alias_index.indisunique
    and 'normalized_alias' = any(alias_index.key_columns)
),
has_exact_alias_ownership_index as (
  select exists (
    select 1
    from alias_index_keys as alias_index
    where alias_index.indisunique
      and cardinality(alias_index.key_columns) = 2
      and alias_index.key_columns @> array['player_id', 'alias']::text[]
  ) as present
),
has_normalized_alias_lookup_index as (
  select exists (
    select 1
    from alias_index_keys as alias_index
    where not alias_index.indisunique
      and 'normalized_alias' = any(alias_index.key_columns)
  ) as present
),
check_rows(check_name, status, object_name, details) as (
  select
    'Unexpected foreign keys to public.players',
    case when exists (select 1 from unexpected_foreign_keys) then 'BLOCK' else 'PASS' end,
    coalesce((select string_agg(table_name || '.' || column_name, ', ' order by table_name, column_name)
              from unexpected_foreign_keys), 'public.players references'),
    coalesce((select string_agg(table_name || '.' || column_name || ' (' || constraint_name || ')', '; ' order by table_name, column_name)
              from unexpected_foreign_keys), 'All foreign keys to public.players are classified by the identity architecture.')
  union all
  select
    'Unclassified player-ID-like columns',
    case when exists (select 1 from unclassified_player_columns) then 'BLOCK' else 'PASS' end,
    coalesce((select string_agg(table_name || '.' || column_name, ', ' order by table_name, column_name)
              from unclassified_player_columns), 'public schema'),
    coalesce((select string_agg(table_name || '.' || column_name || ' type=' || data_type, '; ' order by table_name, column_name)
              from unclassified_player_columns), 'All player-ID-like columns are classified.')
  union all
  select
    'Canonical identity link integrity',
    case when exists (select 1 from broken_links) then 'BLOCK' else 'PASS' end,
    'public.player_identity_links',
    case when exists (select 1 from broken_links)
         then (select count(*)::text || ' broken/self-referential canonical links found.' from broken_links)
         else 'No missing players or self-referential canonical links.' end
  union all
  select
    'Canonical identity cycles',
    case when exists (select 1 from identity_cycles) then 'BLOCK' else 'PASS' end,
    'public.player_identity_links',
    case when exists (select 1 from identity_cycles)
         then (select count(*)::text || ' circular canonical paths found.' from identity_cycles)
         else 'No circular canonical identity paths.' end
  union all
  select
    'Managed roster/schema compatibility',
    case when exists (select 1 from missing_managed_columns) then 'BLOCK' else 'PASS' end,
    coalesce((select string_agg(table_name || '.' || column_name, ', ' order by table_name, column_name)
              from missing_managed_columns), 'managed identity/roster schema'),
    case
      when exists (select 1 from missing_managed_columns)
      then coalesce((select string_agg('Missing ' || table_name || '.' || column_name, '; ' order by table_name, column_name)
                     from missing_managed_columns), '')
           || case
                when exists (
                  select 1 from missing_managed_columns
                  where table_name = 'player_aliases'
                )
                then '. Actual public.player_aliases columns: '
                     || coalesce((select string_agg(column_name || ' ' || data_type || ' nullable=' || is_nullable,
                                                    ', ' order by column_name)
                                  from actual_alias_columns), '[table absent or no visible columns]')
                else ''
              end
      else 'All columns required by canonical identity, Discord synchronization, and managed roster triggers exist.'
    end
  union all
  select
    'Player alias constraint compatibility',
    case
      when exists (select 1 from alias_exact_duplicates) then 'BLOCK'
      when exists (select 1 from incompatible_alias_indexes) then 'BLOCK'
      when not (select present from has_exact_alias_ownership_index) then 'BLOCK'
      when not (select present from has_normalized_alias_lookup_index) then 'BLOCK'
      else 'PASS'
    end,
    'public.player_aliases',
    case
      when exists (select 1 from alias_exact_duplicates)
        then (select string_agg(player_id::text || ' alias=' || alias || ' count=' || duplicate_count,
                                '; ' order by player_id, alias)
              from alias_exact_duplicates)
      when exists (select 1 from incompatible_alias_indexes)
        then (select string_agg(index_name || ': ' || definition, '; ' order by index_name)
              from incompatible_alias_indexes)
      when not (select present from has_exact_alias_ownership_index)
        then 'Missing UNIQUE exact-alias ownership index on (player_id, alias).'
      when not (select present from has_normalized_alias_lookup_index)
        then 'Missing non-unique normalized_alias lookup index.'
      else 'normalized_alias is indexed but not unique, and exact alias text is unique only within one player UUID.'
    end
  union all
  select
    'Known frozen-history references',
    'PASS',
    'Stroke / Match / PYP approved history',
    'Known Final Scorecard, result, schedule, membership, tournament, and trophy references are intentionally retained and resolved canonically; they are not automatic blockers.'
),
final_rows as (
  select check_name, status, object_name, details, 1 as sort_order
  from check_rows
  union all
  select
    'OVERALL MERGE INSTALLATION READINESS',
    case when exists (select 1 from check_rows where status = 'BLOCK') then 'BLOCK'
         when exists (select 1 from check_rows where status = 'REVIEW') then 'REVIEW'
         else 'PASS' end,
    'player_identity_merge.sql',
    case when exists (select 1 from check_rows where status = 'BLOCK')
         then 'Do not install player_identity_merge.sql until every BLOCK row is resolved and classified.'
         when exists (select 1 from check_rows where status = 'REVIEW')
         then 'Review the REVIEW rows before installing player_identity_merge.sql.'
         else 'No schema/reference blocker was found. Safe to proceed with installing player_identity_merge.sql definitions; no player merge occurs during installation.' end,
    2
)
select check_name, status, object_name, details
from final_rows
order by sort_order, check_name;
