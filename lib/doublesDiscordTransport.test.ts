import test from "node:test"
import assert from "node:assert/strict"
import { createDoublesDiscordTransport, DiscordTransportError, resolveDoublesDiscordChannel } from "./doublesDiscordTransport.ts"

test("authoritative Doubles channel map fails closed", () => {
  assert.equal(resolveDoublesDiscordChannel("Doubles Elite"), "1335848394081570911")
  assert.equal(resolveDoublesDiscordChannel("D7"), "1339282438194598071")
  assert.throws(() => resolveDoublesDiscordChannel("D8"), /No authoritative/)
})

test("transport creates and edits messages without exposing credentials", async () => {
  const requests: Request[] = []
  const transport = createDoublesDiscordTransport({ botToken: "secret-token", fetchImpl: async (input, init) => {
    requests.push(new Request(String(input), init))
    return new Response(JSON.stringify({ id: "message-1", channel_id: "1335848394081570911" }), { status: 200 })
  } })
  await transport.createMessage("1335848394081570911", { content: "test" })
  await transport.editMessage("1335848394081570911", "message-1", { content: "updated" })
  assert.equal(requests.length, 2)
  assert.equal(requests[0].headers.get("authorization"), "Bot secret-token")
  assert.doesNotMatch(JSON.stringify(requests.map((request) => request.url)), /secret-token/)
})

test("transport surfaces Discord failures for bounded worker retry handling", async () => {
  const transport = createDoublesDiscordTransport({ botToken: "secret", fetchImpl: async () => new Response(JSON.stringify({ code: "UNKNOWN_MESSAGE", message: "missing" }), { status: 404 }) })
  await assert.rejects(() => transport.deleteMessage("1335848394081570911", "missing"), (error) => error instanceof DiscordTransportError && error.status === 404 && error.code === "UNKNOWN_MESSAGE")
})
