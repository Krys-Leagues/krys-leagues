import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
import { parseKwtSeason9DiscordEvidence, reconcileKwtDiscordIdentities } from "./kwtDiscordEvidence.ts"
import { stageKwtDiscordEvidence } from "./kwtDiscordStaging.ts"

const raw = fs.readFileSync(new URL("../../../docs/historical-sources/kwt/season-09-discord-evidence.txt", import.meta.url), "utf8")
const season = parseKwtSeason9DiscordEvidence(raw, "season-9-source-hash")

test("staging blocks every unresolved identity and preserves provenance", () => {
  const identities = reconcileKwtDiscordIdentities(season, [])
  const staged = stageKwtDiscordEvidence(season, identities)
  assert.equal(staged.summary.ready, 0)
  assert.equal(staged.summary.unresolved, staged.summary.totalFacts)
  assert.ok(staged.facts.every(fact => fact.sourceSha256 === "season-9-source-hash" && fact.rawSourceText.length > 0))
})

test("staging recognizes an existing source fingerprint idempotently", () => {
  const sourceHandle = season.events[0].placements[0].sourceHandle
  const identities = reconcileKwtDiscordIdentities(season, [{ id: "player", screenName: sourceHandle, verifiedAliases: [] }])
  const first = stageKwtDiscordEvidence(season, identities)
  const target = first.facts.find(fact => fact.sourceHandle === sourceHandle)!
  const repeated = stageKwtDiscordEvidence(season, identities, [{ source_fingerprint: target.sourceFingerprint }])
  assert.ok(repeated.facts.some(fact => fact.sourceFingerprint === target.sourceFingerprint && fact.status === "existing"))
})

test("unknown player counts and badge evidence remain explicit review fields", () => {
  const staged = stageKwtDiscordEvidence(season, [])
  assert.ok(staged.unknownFields.some(field => field.week === 1 && field.field === "playerCount"))
  assert.ok(staged.unknownFields.some(field => field.field.startsWith("badge.")))
})
