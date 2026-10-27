import assert from "node:assert/strict"
import test from "node:test"

import { createTournamentDiscordAdapter } from "./discordServer.ts"

test("Discord adapter fails closed without credentials and never returns secrets", async () => {
  const result = await createTournamentDiscordAdapter({ token: null, parentChannelId: "123" }).createPrivateThread({ matchId: "match-1", playerIds: ["1", "2"], body: "rules" })
  assert.deepEqual(result, { status: "not_configured", reason: "Discord bot credentials or tournament parent channel is not configured" })
  assert.doesNotMatch(JSON.stringify(result), /token|Authorization/i)
})

test("Discord adapter creates a private thread, members, and instructions without mentions", async () => {
  const requests: Array<{ url: string; method: string; body: string }> = []
  const fakeFetch: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), method: init?.method || "GET", body: typeof init?.body === "string" ? init.body : "" })
    const url = String(input)
    if (url.endsWith("/threads")) return new Response(JSON.stringify({ id: "thread-1" }), { status: 200 })
    if (url.includes("/messages")) return new Response(JSON.stringify({ id: "message-1" }), { status: 200 })
    return new Response(null, { status: 204 })
  }
  const adapter = createTournamentDiscordAdapter({ token: "test-token", parentChannelId: "parent-1", adminIds: ["9"], fetchImpl: fakeFetch })
  const result = await adapter.createPrivateThread({ matchId: "match-1", playerIds: ["1", "2"], body: "ALL OFFICIAL MATCH SCHEDULING MUST BE DONE ON KRYSLEAGUES.COM." })
  assert.deepEqual(result, { status: "sent", id: "thread-1" })
  assert.equal(requests.length, 5)
  assert.ok(requests.some((request) => request.url.endsWith("/threads") && request.method === "POST"))
  assert.ok(requests.some((request) => request.url.includes("/thread-members/9") && request.method === "PUT"))
  const message = requests.find((request) => request.url.includes("/messages"))
  assert.ok(message)
  assert.match(message.body, /allowed_mentions/)
  assert.doesNotMatch(message.body, /@everyone|@here/)
})
