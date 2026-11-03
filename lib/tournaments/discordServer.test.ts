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

test("Discord verification classifies each member response without exposing credentials", async () => {
  const guildId = "1036296151651074168"
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input))
    if (url.pathname === "/api/v10/users/@me") return new Response(JSON.stringify({ id: "bot" }), { status: 200 })
    if (url.pathname === `/api/v10/guilds/${guildId}/channels`) return new Response(JSON.stringify([]), { status: 200 })
    if (url.pathname === `/api/v10/guilds/${guildId}/roles`) return new Response(JSON.stringify([]), { status: 200 })
    const id = url.pathname.split("/").pop()
    if (id === "member") return new Response(JSON.stringify({ id }), { status: 200 })
    if (id === "missing") return new Response(JSON.stringify({ code: 10007, message: "Unknown Member" }), { status: 404 })
    if (id === "unknown") return new Response(JSON.stringify({ code: 10013, message: "Unknown User" }), { status: 404 })
    if (id === "forbidden") return new Response(JSON.stringify({ code: 50001, message: "Missing Access" }), { status: 403 })
    if (id === "unauthorized") return new Response(JSON.stringify({ code: 0, message: "401 test" }), { status: 401 })
    if (id === "limited") return new Response(JSON.stringify({ retry_after: 0 }), { status: 429 })
    if (id === "server-error") return new Response(JSON.stringify({ message: "Discord unavailable" }), { status: 503 })
    return new Response(JSON.stringify({ message: "Unexpected response" }), { status: 418 })
  }

  const verification = await createTournamentDiscordAdapter({ token: "preview-test-token", fetchImpl }).verifyConnection({
    playerIds: ["member", "missing", "unknown", "forbidden", "unauthorized", "limited", "server-error", "unexpected"],
    adminIds: ["member"],
  })

  const byId = new Map((verification.memberResults || []).map((result) => [result.discordId, result]))
  assert.equal(verification.botCheck?.classification, "CHECK_OK")
  assert.equal(verification.channelsCheck?.classification, "CHECK_OK")
  assert.equal(verification.rolesCheck?.classification, "CHECK_OK")
  assert.deepEqual(byId.get("member"), { discordId: "member", classification: "CONFIRMED_GUILD_MEMBER", httpStatus: 200, discordCode: null })
  assert.equal(byId.get("missing")?.classification, "NOT_IN_GUILD")
  assert.equal(byId.get("unknown")?.classification, "UNKNOWN_DISCORD_USER")
  assert.equal(byId.get("forbidden")?.classification, "BOT_PERMISSION_FAILURE")
  assert.equal(byId.get("unauthorized")?.classification, "BOT_AUTHENTICATION_FAILURE")
  assert.equal(byId.get("limited")?.classification, "DISCORD_RATE_LIMIT")
  assert.equal(byId.get("server-error")?.classification, "DISCORD_API_FAILURE")
  assert.equal(byId.get("unexpected")?.classification, "UNKNOWN_VERIFICATION_ERROR")
  assert.equal(verification.verifiedPlayerCount, 1)
  assert.equal(verification.verifiedAdminCount, 1)
})

test("Discord verification queues unique member lookups and retries 429 after the server delay", async () => {
  const guildId = "1036296151651074168"
  const memberAttempts = new Map<string, number>()
  let activeMemberLookups = 0
  let maxActiveMemberLookups = 0
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input))
    if (url.pathname === "/api/v10/users/@me") return new Response(JSON.stringify({ id: "bot" }), { status: 200 })
    if (url.pathname === `/api/v10/guilds/${guildId}/channels`) return new Response(JSON.stringify([]), { status: 200 })
    if (url.pathname === `/api/v10/guilds/${guildId}/roles`) return new Response(JSON.stringify([]), { status: 200 })
    const id = url.pathname.split("/").pop() || ""
    activeMemberLookups += 1
    maxActiveMemberLookups = Math.max(maxActiveMemberLookups, activeMemberLookups)
    memberAttempts.set(id, (memberAttempts.get(id) || 0) + 1)
    await new Promise((resolve) => setTimeout(resolve, 1))
    activeMemberLookups -= 1
    if (id === "limited" && memberAttempts.get(id) === 1) {
      return new Response(JSON.stringify({ retry_after: 0, global: true }), { status: 429, headers: { "retry-after": "0", "x-ratelimit-global": "true" } })
    }
    return new Response(JSON.stringify({ id }), { status: 200 })
  }

  const verification = await createTournamentDiscordAdapter({ token: "preview-test-token", fetchImpl }).verifyConnection({
    playerIds: ["limited", "limited", "member"],
    adminIds: ["limited"],
  })

  const byId = new Map((verification.memberResults || []).map((result) => [result.discordId, result]))
  assert.equal(maxActiveMemberLookups, 1)
  assert.equal(memberAttempts.get("limited"), 2)
  assert.equal(memberAttempts.get("member"), 1)
  assert.equal(byId.get("limited")?.classification, "CONFIRMED_GUILD_MEMBER")
  assert.equal(verification.verifiedPlayerCount, 2)
  assert.equal(verification.verifiedAdminCount, 1)
})

test("Discord resource provisioning is idempotent and creates only missing tournament resources", async () => {
  const guildId = "1036296151651074168"
  const createdPaths: string[] = []
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    const method = (init?.method || "GET").toUpperCase()
    if (url.pathname === `/api/v10/guilds/${guildId}/channels` && method === "GET") return new Response(JSON.stringify([]), { status: 200 })
    if (url.pathname === `/api/v10/guilds/${guildId}/roles` && method === "GET") return new Response(JSON.stringify([]), { status: 200 })
    if (url.pathname === `/api/v10/guilds/${guildId}/channels` && method === "POST") {
      createdPaths.push("channel")
      const body = JSON.parse(String(init?.body || "{}")) as { type?: number }
      return new Response(JSON.stringify({ id: body.type === 4 ? "category" : "match-channel" }), { status: 201 })
    }
    if (url.pathname === `/api/v10/guilds/${guildId}/roles` && method === "POST") {
      createdPaths.push("role")
      return new Response(JSON.stringify({ id: "role" }), { status: 200 })
    }
    return new Response(JSON.stringify({ message: "unexpected request" }), { status: 404 })
  }

  const provisioning = await createTournamentDiscordAdapter({ token: "preview-test-token", fetchImpl }).ensureTournamentResources()
  assert.equal(provisioning.status, "created")
  assert.deepEqual(provisioning.created, { category: true, role: true, matchChannel: true })
  assert.deepEqual(createdPaths, ["channel", "role", "channel"])
})
