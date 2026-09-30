import assert from "node:assert/strict"
import test from "node:test"

import { loadProtectedAdminPlayers } from "./adminPlayersClient.ts"

test("protected admin player loader uses the authorized no-cache endpoint", async () => {
  const originalFetch = globalThis.fetch
  const requests: Array<{ input: string | URL | Request; init?: RequestInit }> = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ input, init })
    return new Response(JSON.stringify({
      players: [{
        id: "player-1",
        screen_name: "Exact_Name",
        discord_id: null,
        discord_name: null,
        discord_username: null,
        discord_avatar: null,
        status: "active",
        active: true,
        division: "Pro D1",
        avatar_path: null,
        is_server_booster: false,
        has_krys_server_tag: false,
        profile_badges: [],
      }],
      leagueMemberships: [],
      tournamentEntries: [],
      identityLinks: [],
    }), { status: 200, headers: { "Content-Type": "application/json" } })
  }) as typeof fetch

  try {
    const players = await loadProtectedAdminPlayers()
    assert.equal(players[0]?.screen_name, "Exact_Name")
    assert.equal(requests[0]?.input, "/api/admin/players")
    assert.equal(requests[0]?.init?.method, "GET")
    assert.equal(requests[0]?.init?.cache, "no-store")
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("protected admin player loader surfaces authorization failures", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(
    JSON.stringify({ error: "Administrator authorization is required" }),
    { status: 403, headers: { "Content-Type": "application/json" } },
  )) as typeof fetch

  try {
    await assert.rejects(
      () => loadProtectedAdminPlayers(),
      /Administrator authorization is required/,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
