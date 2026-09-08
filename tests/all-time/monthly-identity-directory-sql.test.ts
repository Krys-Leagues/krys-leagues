import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const sql = readFileSync("docs/historical-sources/monthly/repaired-history/monthly-identity-directory-readonly.sql", "utf8")
const executableSql = sql.replace(/--.*$/gm, "").replace(/\\s+/g, " ").trim()

test("Monthly identity directory export is SELECT-only and uses approved tables", () => {
  assert.match(executableSql, /^WITH RECURSIVE/)
  assert.match(executableSql, /FROM public\.players/)
  assert.match(executableSql, /FROM public\.player_aliases/)
  assert.match(executableSql, /FROM public\.player_identity_links/)
  assert.match(executableSql, /regexp_replace\(lower\(trim\(coalesce\(player\.screen_name/)
  assert.match(executableSql, /alias\.verified = true/)
  assert.doesNotMatch(executableSql, /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CALL|PERFORM)\b/i)
})

test("Monthly identity directory export includes matcher-required fields and row types", () => {
  for (const column of [
    "identity_type",
    "canonical_player_id",
    "canonical_screen_name",
    "canonical_normalized_name",
    "source_player_id",
    "source_name",
    "source_normalized_name",
    "discord_name",
    "discord_id",
    "active",
    "alias_id",
    "alias_name",
    "alias_normalized_name",
    "alias_source",
    "alias_verified",
    "historical_player_id",
    "mapped_canonical_player_id",
  ]) {
    assert.ok(executableSql.includes("AS " + column))
  }
  assert.match(executableSql, /'PLAYER'/)
  assert.match(executableSql, /'ALIAS'/)
  assert.match(executableSql, /'MAPPED'/)
  assert.match(executableSql, /ORDER BY identity_type, canonical_player_id, source_name, source_player_id/)
})
