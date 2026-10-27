import assert from "node:assert/strict"
import test from "node:test"
import { loadMonthlyIdentityDirectoryCsv } from "./monthlyIdentityDirectoryCsv.ts"

const csv = [
  "identity_type,canonical_player_id,canonical_screen_name,canonical_normalized_name,source_player_id,source_name,source_normalized_name,discord_name,discord_id,active,alias_id,alias_name,alias_normalized_name,alias_source,alias_verified,historical_player_id,mapped_canonical_player_id",
  "PLAYER,canonical,CANONICAL,canonical,legacy,Legacy Name,legacyname,null,null,false,null,null,null,null,null,null,null",
  "PLAYER,canonical,CANONICAL,canonical,canonical,CANONICAL,canonical,Discord,123,true,null,null,null,null,null,null,null",
  "ALIAS,canonical,CANONICAL,canonical,legacy,Legacy Name,legacyname,null,null,null,alias-1,Legacy Name,legacyname,historical_alias,true,null,null",
  "MAPPED,canonical,CANONICAL,canonical,legacy,Legacy Name,legacyname,null,null,false,null,null,null,null,null,legacy,canonical",
].join("\n")

test("CSV adapter reconstructs PLAYER, verified ALIAS, and MAPPED inputs", () => {
  const directory = loadMonthlyIdentityDirectoryCsv(csv)
  assert.deepEqual(directory.rowCounts, { PLAYER: 2, ALIAS: 1, MAPPED: 1 })
  assert.equal(directory.rawPlayers.length, 2)
  assert.equal(directory.aliases[0].playerId, "canonical")
  assert.equal(directory.canonicalId("legacy"), "canonical")
  assert.equal(directory.matchNames(["Legacy Name"])[0].autoLinkEligible, true)
})

test("CSV adapter ignores unverified aliases", () => {
  const unverified = csv.replace("historical_alias,true,null,null", "historical_alias,false,null,null")
  const directory = loadMonthlyIdentityDirectoryCsv(unverified)
  assert.equal(directory.aliases.length, 0)
})
