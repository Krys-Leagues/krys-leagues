import assert from "node:assert/strict"
import test from "node:test"
import { getAuthenticatedDiscordId, getDiscordPlayerLoginDestination } from "./discordPlayerLogin.ts"

const canonicalId = "11111111-1111-1111-1111-111111111111"

test("an exact resolved Discord identity reaches the canonical player's destination", () => {
  assert.equal(getDiscordPlayerLoginDestination({
    resolution_status: "matched",
    canonical_player_id: canonicalId,
  }, null), "/dashboard")
})

test("repeated resolution of one Discord identity remains idempotent", () => {
  const resolution = { resolution_status: "matched" as const, canonical_player_id: canonicalId }
  assert.deepEqual(Array.from({ length: 3 }, () => getDiscordPlayerLoginDestination(resolution, null)), [
    "/dashboard",
    "/dashboard",
    "/dashboard",
  ])
})

test("a no-match identity reaches only the approved onboarding path", () => {
  const resolution = { resolution_status: "no_match" as const, canonical_player_id: null }
  assert.equal(getDiscordPlayerLoginDestination(resolution, "/register?league=match"), "/register?league=match")
  assert.equal(getDiscordPlayerLoginDestination(resolution, "/majors/example"), "/join")
})

test("conflicting or malformed identity evidence cannot select a player", () => {
  assert.equal(getDiscordPlayerLoginDestination({ resolution_status: "conflict", canonical_player_id: null }, null), null)
  assert.equal(getDiscordPlayerLoginDestination({ resolution_status: "matched", canonical_player_id: null }, null), null)
  assert.equal(getDiscordPlayerLoginDestination(null, null), null)
})

test("Discord display names and screen names are not login inputs", () => {
  assert.deepEqual(Object.keys({ resolution_status: "matched", canonical_player_id: canonicalId }).sort(), [
    "canonical_player_id",
    "resolution_status",
  ])
})

test("Discord snowflakes remain strings and never fall back to the Supabase user UUID", () => {
  const snowflake = "123456789012345678"
  assert.equal(getAuthenticatedDiscordId({ identities: [{
    provider: "discord",
    identity_data: { provider_id: snowflake },
  }] }), snowflake)
  assert.equal(getAuthenticatedDiscordId({ identities: [{
    provider: "email",
    identity_data: { provider_id: "not-discord" },
  }] }), "")
})
