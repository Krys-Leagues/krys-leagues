import assert from "node:assert/strict"
import test from "node:test"

import { createTournamentDiscordAdapter } from "./discordServer.ts"

test("Discord verification fails closed when the server token is absent", async () => {
  const adapter = createTournamentDiscordAdapter({ token: null })

  const verification = await adapter.verifyConnection({ playerIds: ["101"], adminIds: ["201"] })
  assert.equal(verification.status, "not_configured")

  const creation = await adapter.createPrivateThread({
    parentChannelId: "channel",
    matchId: "match",
    playerIds: ["101", "102"],
    adminIds: ["201"],
    body: "test",
  })
  assert.equal(creation.status, "not_configured")
})

test("Discord verification checks the bot, tournament structure, and requested members", async () => {
  const guildId = "1036296151651074168"
  const requestedPaths: string[] = []
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input))
    requestedPaths.push(url.pathname)

    if (url.pathname === "/api/v10/users/@me") return new Response(JSON.stringify({ id: "bot" }), { status: 200 })
    if (url.pathname === `/api/v10/guilds/${guildId}/channels`) {
      return new Response(JSON.stringify([
        { id: "category", name: "5-4-3-2-1 TOURNAMENT", type: 4 },
        { id: "match-channel", name: "MATCH THREADS", type: 0, parent_id: "category" },
      ]), { status: 200 })
    }
    if (url.pathname === `/api/v10/guilds/${guildId}/roles`) {
      return new Response(JSON.stringify([{ id: "role", name: "5-4-3-2-1 Players" }]), { status: 200 })
    }
    if (url.pathname.startsWith(`/api/v10/guilds/${guildId}/members/`)) return new Response("{}", { status: 200 })
    return new Response(JSON.stringify({ message: "unexpected request" }), { status: 404 })
  }

  const verification = await createTournamentDiscordAdapter({
    token: "preview-test-token",
    fetchImpl,
  }).verifyConnection({ playerIds: ["101", "102"], adminIds: ["201"] })

  assert.equal(verification.status, "ready")
  assert.equal(verification.botUserConfigured, true)
  assert.equal(verification.categoryFound, true)
  assert.equal(verification.matchChannelFound, true)
  assert.equal(verification.playerRoleFound, true)
  assert.equal(verification.verifiedPlayerCount, 2)
  assert.equal(verification.verifiedAdminCount, 1)
  assert.equal(verification.parentChannelId, "match-channel")
  assert.equal(requestedPaths.some((path) => path.endsWith("/threads")), false)
})
