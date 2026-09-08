-- READ-ONLY export for the existing Global Players identity matcher.
-- Run manually in the normal Supabase SQL Editor, then export the result as CSV.
-- This statement intentionally contains SELECT/CTE logic only:
-- no INSERT, UPDATE, DELETE, DDL, RPC, or identity write.
--
-- Row types:
--   PLAYER  = every raw public.players record used by matchPlayers
--   ALIAS   = every verified public.player_aliases record used by loadIdentityDirectory
--   MAPPED  = every public.player_identity_links redirect, including its terminal target
--
-- The PLAYER rows retain redirected source player records while exposing their
-- terminal canonical public.players.id. This mirrors canonicalId + matchPlayers.

WITH RECURSIVE link_edges AS (
  SELECT
    historical_player_id::text AS historical_player_id,
    canonical_player_id::text AS canonical_player_id
  FROM public.player_identity_links
),
link_walk AS (
  SELECT
    historical_player_id,
    canonical_player_id,
    ARRAY[historical_player_id, canonical_player_id]::text[] AS path
  FROM link_edges

  UNION ALL

  SELECT
    walk.historical_player_id,
    edge.canonical_player_id,
    walk.path || edge.canonical_player_id
  FROM link_walk AS walk
  JOIN link_edges AS edge
    ON edge.historical_player_id = walk.canonical_player_id
  WHERE NOT edge.canonical_player_id = ANY(walk.path)
),
resolved_links AS (
  SELECT DISTINCT ON (historical_player_id)
    historical_player_id,
    canonical_player_id
  FROM link_walk
  ORDER BY historical_player_id, cardinality(path) DESC
),
raw_players AS (
  SELECT
    player.id::text AS source_player_id,
    player.screen_name AS source_name,
    regexp_replace(lower(trim(coalesce(player.screen_name, ''))), '[^a-z0-9]', '', 'g') AS source_normalized_name,
    player.discord_name,
    player.discord_id::text AS discord_id,
    player.active,
    coalesce(resolved.canonical_player_id, player.id::text) AS canonical_player_id
  FROM public.players AS player
  LEFT JOIN resolved_links AS resolved
    ON resolved.historical_player_id = player.id::text
),
canonical_players AS (
  SELECT
    player.id::text AS canonical_player_id,
    player.screen_name AS canonical_screen_name,
    regexp_replace(lower(trim(coalesce(player.screen_name, ''))), '[^a-z0-9]', '', 'g') AS canonical_normalized_name
  FROM public.players AS player
)

SELECT
  'PLAYER'::text AS identity_type,
  canonical.canonical_player_id,
  canonical.canonical_screen_name,
  canonical.canonical_normalized_name,
  source.source_player_id,
  source.source_name,
  source.source_normalized_name,
  source.discord_name,
  source.discord_id,
  source.active,
  NULL::text AS alias_id,
  NULL::text AS alias_name,
  NULL::text AS alias_normalized_name,
  NULL::text AS alias_source,
  NULL::boolean AS alias_verified,
  NULL::text AS historical_player_id,
  NULL::text AS mapped_canonical_player_id
FROM raw_players AS source
LEFT JOIN canonical_players AS canonical
  ON canonical.canonical_player_id = source.canonical_player_id

UNION ALL

SELECT
  'ALIAS'::text AS identity_type,
  canonical.canonical_player_id,
  canonical.canonical_screen_name,
  canonical.canonical_normalized_name,
  alias.player_id::text AS source_player_id,
  alias.alias AS source_name,
  regexp_replace(lower(trim(coalesce(alias.normalized_alias, alias.alias, ''))), '[^a-z0-9]', '', 'g') AS source_normalized_name,
  NULL::text AS discord_name,
  NULL::text AS discord_id,
  NULL::boolean AS active,
  alias.id::text AS alias_id,
  alias.alias AS alias_name,
  alias.normalized_alias AS alias_normalized_name,
  alias.source AS alias_source,
  alias.verified AS alias_verified,
  NULL::text AS historical_player_id,
  NULL::text AS mapped_canonical_player_id
FROM public.player_aliases AS alias
JOIN raw_players AS source
  ON source.source_player_id = alias.player_id::text
LEFT JOIN canonical_players AS canonical
  ON canonical.canonical_player_id = source.canonical_player_id
WHERE alias.verified = true

UNION ALL

SELECT
  'MAPPED'::text AS identity_type,
  canonical.canonical_player_id,
  canonical.canonical_screen_name,
  canonical.canonical_normalized_name,
  source.source_player_id,
  source.source_name,
  source.source_normalized_name,
  source.discord_name,
  source.discord_id,
  source.active,
  NULL::text AS alias_id,
  NULL::text AS alias_name,
  NULL::text AS alias_normalized_name,
  NULL::text AS alias_source,
  NULL::boolean AS alias_verified,
  resolved.historical_player_id,
  resolved.canonical_player_id AS mapped_canonical_player_id
FROM resolved_links AS resolved
JOIN raw_players AS source
  ON source.source_player_id = resolved.historical_player_id
LEFT JOIN canonical_players AS canonical
  ON canonical.canonical_player_id = resolved.canonical_player_id

ORDER BY identity_type, canonical_player_id, source_name, source_player_id;
