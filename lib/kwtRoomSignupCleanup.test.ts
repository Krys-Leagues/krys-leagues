import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  deleteKwtRoomSignupMessages,
  KWT_ROOM_SIGNUP_BOT_ID,
  KWT_ROOM_SIGNUP_CHANNEL_ID,
  planKwtRoomSignupCleanup,
  runKwtRoomSignupCleanupExclusive,
  type KwtDiscordMessage,
} from "./kwtRoomSignupCleanup.ts"

const nowMs = Date.parse("2026-10-01T20:00:00-04:00")

function signup(id: string, options: Partial<KwtDiscordMessage> = {}): KwtDiscordMessage {
  return {
    id,
    timestamp: "2026-09-24T23:42:44.817Z",
    pinned: false,
    type: 0,
    author: { id: KWT_ROOM_SIGNUP_BOT_ID, bot: true },
    content: "",
    embeds: [{
      title: "KWT71 - <t:1790578800:F>",
      description: "## Laser Lair Easy & Hard\r## ROOM KWT71\r-# React below to sign-up.",
    }],
    components: [],
    attachments: [],
    ...options,
  }
}

test("mixed channel deletes only exact unpinned obsolete KWT signup posts", () => {
  const messages = [
    signup("delete-1"),
    signup("delete-2", { embeds: [{
      title: "KWT72 - <t:1790578800:F>",
      description: "## Tourist Trap Easy & Hard\n## ROOM KWT72\n-# React below to sign-up.",
    }] }),
    signup("pinned", { pinned: true }),
    signup("pinned-api"),
    signup("human", { author: { id: "human", bot: false }, content: "Admin instruction", embeds: [] }),
    signup("admin", { author: { id: "admin", bot: false }, content: "Announcement", embeds: [] }),
    signup("unrelated-bot", { author: { id: "other", bot: true } }),
    signup("ambiguous", { embeds: [{ title: "KWT71", description: "Maybe a signup" }] }),
    signup("future", { embeds: [{
      title: "KWT73 - <t:1890578800:F>",
      description: "## Laser Lair Easy & Hard\r## ROOM KWT73\r-# React below to sign-up.",
    }] }),
  ]
  const plan = planKwtRoomSignupCleanup(messages, new Set(["pinned-api"]), nowMs)
  assert.deepEqual(plan.candidates.map((message) => message.id), ["delete-1", "delete-2"])
  assert.deepEqual(plan.protected, { pinned: 2, humanAdmin: 2, unrelatedBot: 3, total: 7 })
})

test("zero matches is idempotent and makes no deletion calls", async () => {
  let calls = 0
  const result = await deleteKwtRoomSignupMessages({
    candidates: [], nowMs,
    transport: {
      async bulkDelete() { calls += 1 },
      async deleteOne() { calls += 1 },
    },
  })
  assert.equal(calls, 0)
  assert.deepEqual(result, { deletedCount: 0, failures: [], method: "none" })
})

test("recent posts use bulk delete and old posts use individual delete", async () => {
  const bulk: string[][] = []
  const individual: string[] = []
  const result = await deleteKwtRoomSignupMessages({
    candidates: [
      signup("recent-1", { timestamp: "2026-09-30T12:00:00Z" }),
      signup("recent-2", { timestamp: "2026-09-30T12:01:00Z" }),
      signup("old", { timestamp: "2026-08-01T12:00:00Z" }),
    ],
    nowMs,
    transport: {
      async bulkDelete(ids) { bulk.push(ids) },
      async deleteOne(id) { individual.push(id) },
    },
  })
  assert.deepEqual(bulk, [["recent-1", "recent-2"]])
  assert.deepEqual(individual, ["old"])
  assert.deepEqual(result, { deletedCount: 3, failures: [], method: "bulk_and_individual" })
})

test("permission and partial deletion failures are reported truthfully", async () => {
  const permissionError = Object.assign(new Error("Forbidden"), { status: 403 })
  const result = await deleteKwtRoomSignupMessages({
    candidates: [
      signup("recent-1", { timestamp: "2026-09-30T12:00:00Z" }),
      signup("recent-2", { timestamp: "2026-09-30T12:01:00Z" }),
      signup("old", { timestamp: "2026-08-01T12:00:00Z" }),
    ],
    nowMs,
    transport: {
      async bulkDelete() { throw permissionError },
      async deleteOne() {},
    },
  })
  assert.equal(result.deletedCount, 1)
  assert.deepEqual(result.failures, [
    { messageId: "recent-1", status: 403 },
    { messageId: "recent-2", status: 403 },
  ])
})

test("concurrent cleanup is rejected while the first execution is active", async () => {
  let release!: () => void
  const waiting = new Promise<void>((resolve) => { release = resolve })
  const first = runKwtRoomSignupCleanupExclusive(async () => {
    await waiting
    return "done"
  })
  const second = await runKwtRoomSignupCleanupExclusive(async () => "should-not-run")
  assert.deepEqual(second, { status: "in-flight" })
  release()
  assert.deepEqual(await first, { status: "completed", value: "done" })
})

test("route is site-admin protected and channel is server-authoritative", () => {
  const route = readFileSync("app/api/admin/kwt/clear-room-signups/route.ts", "utf8")
  const auth = route.indexOf("await authorizeSiteAdminMutation()")
  const token = route.indexOf("getKwtDiscordBotToken()")
  assert.ok(auth >= 0 && auth < token)
  assert.doesNotMatch(route, /request\.json|searchParams|get\("channel/i)
  assert.match(route, /KWT_ROOM_SIGNUP_CHANNEL_ID/)
  assert.match(route, /kwt_room_signup_cleanup_audit/)
})

test("UI requires a second confirmation and disables duplicate submission", () => {
  const source = readFileSync("components/admin/kwt/KwtRoomSignupCleanup.tsx", "utf8")
  assert.match(source, /CLEAR KWT ROOM SIGNUPS/)
  assert.match(source, /CLEAR SIGNUPS/)
  assert.match(source, /setConfirming\(true\)/)
  assert.match(source, /disabled=\{processing\}/)
  assert.match(source, /if \(processing\) return/)
})

test("audit migration is locked to the one KWT channel and service role", () => {
  const sql = readFileSync("supabase/migrations/20261002021417_kwt_room_signup_cleanup_audit.sql", "utf8")
  assert.match(sql, new RegExp(KWT_ROOM_SIGNUP_CHANNEL_ID))
  assert.match(sql, /enable row level security/i)
  assert.match(sql, /force row level security/i)
  assert.match(sql, /revoke all.*public, anon, authenticated/i)
  assert.match(sql, /grant select, insert, update.*service_role/i)
  assert.match(sql, /where final_status = 'running'/i)
})
