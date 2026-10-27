import assert from "node:assert/strict"
import test from "node:test"

import {
  createDiscordMessage,
  deleteDiscordMessage,
  deliverMastersAdminDms,
  formatMastersAdminDm,
  formatMastersVerificationAlert,
  hasMastersVerificationWork,
  MASTERS_ADMIN_LOOKUPS,
  MASTERS_VERIFICATION_DISCORD_CHANNEL_ID,
  mastersVerificationPayloadHash,
  updateDiscordMessage,
  validateMastersAdminRecipients,
  type MastersAdminDmRecipient,
  type MastersAdminHelpContext,
  type MastersVerificationRoomState,
} from "./mastersDiscord.ts"

const recipients: MastersAdminDmRecipient[] = [
  { label: "Krys", lookup_name: "princessbankshot", canonical_player_id: "player-krys", canonical_screen_name: "PRINCESS_BANKSHOT", discord_user_id: "1001" },
  { label: "Tricky", lookup_name: "trickydicky", canonical_player_id: "player-tricky", canonical_screen_name: "TRICKYDICKY", discord_user_id: "1002" },
  { label: "Dawn", lookup_name: "spicy", canonical_player_id: "player-dawn", canonical_screen_name: "DawnSophia (Spicy)", discord_user_id: "1003" },
  { label: "Lynn", lookup_name: "lynniebodd", canonical_player_id: "player-lynn", canonical_screen_name: "lynniebodd", discord_user_id: "1004" },
]

const helpContext: MastersAdminHelpContext = {
  request_id: "request",
  player_id: "canonical-player",
  player_screen_name: "PLAYER ONE",
  event_name: "THE MINI-GOLF MASTERS",
  round_number: 1,
  room_label: "KMGM10",
  scheduled_start: "2026-10-01T12:00:00Z",
  local_display_time: "8:00 AM EDT",
  category: "PLAYER NO-SHOW",
  message: "A player has not arrived.",
  submitted_at: "2026-10-01T11:58:00Z",
  other_room: { room_label: "KMGM11", players: ["Player A", "Player B", "Player C"] },
}

const roomState: MastersVerificationRoomState = {
  major_event_id: "event",
  play_day_id: "round",
  schedule_group_id: "room",
  round_number: 1,
  room_label: "KMGM10",
  room_scorecard_uploaded: true,
  roster_size: 3,
  submitted_count: 3,
  correction_count: 0,
  verified_count: 0,
  action_required_count: 3,
}

test("all four Masters admin lookup identities are required and unique", () => {
  assert.deepEqual(MASTERS_ADMIN_LOOKUPS.map((admin) => admin.label), ["Krys", "Tricky", "Dawn", "Lynn"])
  assert.equal(validateMastersAdminRecipients(recipients).length, 4)
  assert.throws(() => validateMastersAdminRecipients(recipients.slice(0, 3)), /AMBIGUOUS/)
  assert.throws(() => validateMastersAdminRecipients([...recipients.slice(0, 3), { ...recipients[3], discord_user_id: "1001" }]), /AMBIGUOUS/)
})

test("Contact Admin attempts every personal DM when one admin blocks delivery", async () => {
  const attemptedRecipients: string[] = []
  const postedChannels: string[] = []
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input)
    if (url.endsWith("/users/@me/channels")) {
      const recipient = String(JSON.parse(String(init?.body)).recipient_id)
      attemptedRecipients.push(recipient)
      if (recipient === "1002") return new Response("blocked", { status: 403 })
      return Response.json({ id: `20${recipient}` })
    }
    postedChannels.push(url)
    return Response.json({ id: `message-${postedChannels.length}` })
  }

  const deliveries = await deliverMastersAdminDms({
    botToken: "test-token",
    recipients,
    content: formatMastersAdminDm(helpContext),
    fetchImpl: fakeFetch,
  })
  assert.deepEqual(attemptedRecipients.toSorted(), ["1001", "1002", "1003", "1004"])
  assert.equal(deliveries.filter((delivery) => delivery.status === "sent").length, 3)
  assert.equal(deliveries.find((delivery) => delivery.label === "Tricky")?.status, "failed")
  assert.equal(postedChannels.length, 3)
  assert.ok(postedChannels.every((url) => /\/channels\/\d+\/messages$/.test(url)))
})

test("all-four DM failure is represented truthfully", async () => {
  const deliveries = await deliverMastersAdminDms({
    botToken: "test-token",
    recipients,
    content: "Alert",
    fetchImpl: async () => new Response("blocked", { status: 403 }),
  })
  assert.equal(deliveries.length, 4)
  assert.ok(deliveries.every((delivery) => delivery.status === "failed"))
})

test("no-show DMs contain canonical context and same-time alternate room without moving anyone", () => {
  const message = formatMastersAdminDm(helpContext)
  assert.match(message, /Canonical player ID: canonical-player/)
  assert.match(message, /ANOTHER ROOM IS RUNNING/)
  assert.match(message, /Room: KMGM11/)
  assert.match(message, /Player A[\s\S]*Player B[\s\S]*Player C/)
  assert.doesNotMatch(message, /reassign|move player/i)

  const noAlternate = formatMastersAdminDm({ ...helpContext, other_room: null })
  assert.match(noAlternate, /NO OTHER MASTERS ROOM RUNNING AT THIS TIME/)
})

test("room verification alert keeps one room-round payload with correction work visible", () => {
  assert.equal(MASTERS_VERIFICATION_DISCORD_CHANNEL_ID, "1555012516625653840")
  const initial = formatMastersVerificationAlert(roomState, "https://krysleagues.com/admin/majors/verification")
  assert.match(initial, /Round 1 · KMGM10/)
  assert.match(initial, /Room Scorecard: Uploaded/)
  assert.match(initial, /3 SCORES WAITING/)
  assert.match(initial, /0 \/ 3 VERIFIED/)
  assert.doesNotMatch(initial, /scorecard.*https?:\/\//i)
  assert.equal(hasMastersVerificationWork(roomState), true)

  const correction = { ...roomState, submitted_count: 0, correction_count: 1, verified_count: 2, action_required_count: 1 }
  const correctedMessage = formatMastersVerificationAlert(correction, "https://krysleagues.com/admin/majors/verification")
  assert.match(correctedMessage, /1 NEEDS CORRECTION/)
  assert.equal(hasMastersVerificationWork(correction), true)

  const complete = { ...roomState, submitted_count: 0, correction_count: 0, verified_count: 3, action_required_count: 0 }
  assert.equal(hasMastersVerificationWork(complete), false)
  assert.notEqual(mastersVerificationPayloadHash(roomState, initial), mastersVerificationPayloadHash(correction, correctedMessage))
})

test("Discord room alert create, update, and delete use the one private verification channel", async () => {
  const calls: Array<{ url: string; method: string }> = []
  const fakeFetch: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), method: String(init?.method) })
    return init?.method === "POST" ? Response.json({ id: "message-1" }) : new Response(null, { status: 204 })
  }
  const messageId = await createDiscordMessage({ botToken: "token", channelId: MASTERS_VERIFICATION_DISCORD_CHANNEL_ID, content: "one", fetchImpl: fakeFetch })
  await updateDiscordMessage({ botToken: "token", channelId: MASTERS_VERIFICATION_DISCORD_CHANNEL_ID, messageId, content: "two", fetchImpl: fakeFetch })
  await deleteDiscordMessage({ botToken: "token", channelId: MASTERS_VERIFICATION_DISCORD_CHANNEL_ID, messageId, fetchImpl: fakeFetch })
  assert.deepEqual(calls.map((call) => call.method), ["POST", "PATCH", "DELETE"])
  assert.ok(calls.every((call) => call.url.includes(`/channels/${MASTERS_VERIFICATION_DISCORD_CHANNEL_ID}/messages`)))
})
