import assert from "node:assert/strict"
import test from "node:test"

import { buildCanonicalPlayerMap, resolveCanonicalPlayerDisplay } from "../../lib/all-time/climbers-ytd-display.ts"

test("YTD display resolves inactive canonical players by current screen name", () => {
  const map = buildCanonicalPlayerMap([
    { id: "inactive-id", screen_name: "Zoedarlin" },
    { id: "active-id", screen_name: "THE REAL JB" },
  ])

  assert.deepEqual(resolveCanonicalPlayerDisplay("inactive-id", map), { label: "Zoedarlin", diagnosticId: null })
  assert.deepEqual(resolveCanonicalPlayerDisplay("active-id", map), { label: "THE REAL JB", diagnosticId: null })
})

test("unresolved YTD identity is flagged without using the UUID as the label", () => {
  const playerId = "missing-id"
  const display = resolveCanonicalPlayerDisplay(playerId, buildCanonicalPlayerMap([]))

  assert.equal(display.label, "Unknown canonical player")
  assert.equal(display.diagnosticId, playerId)
})

test("canonical screen names preserve stored spelling exactly", () => {
  const map = buildCanonicalPlayerMap([{ id: "spicy-id", screen_name: "DawnSophia (Spicy)" }])

  assert.deepEqual(resolveCanonicalPlayerDisplay("spicy-id", map), { label: "DawnSophia (Spicy)", diagnosticId: null })
})
