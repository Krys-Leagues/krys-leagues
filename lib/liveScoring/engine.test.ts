import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { MGA_DEMO_PLAYERS, MGA_STUDIO_CONFIG } from "./config.ts"
import { activeRoomNotices, calculateLeaderboard, canPlayerSubmitRound, dateTimeInputInZone, dateTimeInputToUtc, formatToPar, publishedRoomAssignments, roomNoticeKey, setRoomPublished, transferRoomPlayer, tournamentStorageKey, updateRoomRecord } from "./engine.ts"
import type { RoomAssignment, RoomRecord, RoundScore } from "./types.ts"

test("combined scoring sums only played rounds, ranks low totals first, and preserves ties", () => {
  const scores: RoundScore[] = [
    { playerId: "demo-aria", roundId: "r1", strokes: 50, status: "verified", updatedAt: "" },
    { playerId: "demo-aria", roundId: "r2", strokes: 52, status: "verified", updatedAt: "" },
    { playerId: "demo-blake", roundId: "r1", strokes: 52, status: "verified", updatedAt: "" },
    { playerId: "demo-blake", roundId: "r2", strokes: 50, status: "verified", updatedAt: "" },
    { playerId: "demo-casey", roundId: "r1", strokes: 49, status: "submitted", updatedAt: "" },
  ]
  const rows = calculateLeaderboard(MGA_STUDIO_CONFIG, MGA_DEMO_PLAYERS, scores)
  assert.equal(rows[0].combined, -6)
  assert.equal(rows[0].rank, 1)
  assert.equal(rows[1].combined, -6)
  assert.equal(rows[1].rank, 1)
  assert.equal(rows[2].combined, -5)
  assert.equal(rows[2].rank, 3)
  assert.equal(rows[0].playedRounds, 2)
  assert.equal(rows[0].status, "Provisional")
  assert.equal(rows.find((row) => row.player.id === "demo-drew")?.combined, null)
  assert.equal(rows.find((row) => row.player.id === "demo-drew")?.rounds[0].toPar, null)
  assert.equal(formatToPar(null), "Not Played")
  assert.equal(formatToPar(-5), "-5")
})

test("room notices target one published room and refresh on assignment changes", () => {
  const base: RoomAssignment = { eventId: "event-a", roomId: "room-11", playerId: "demo-aria", roundId: "r1", screenName: "Aria Demo", roomName: "KMGA11", course: "Gardens of Babylon", difficulty: "easy", startsAt: "2026-11-12T12:30:00Z", timeZone: "America/Los_Angeles", roomRoster: ["Aria Demo", "Blake Demo"], publishedVersion: 1, published: true }
  const otherRoom = { ...base, roomId: "room-12", playerId: "demo-casey", roomName: "KMGA12", published: false }
  const moved = { ...base, roomName: "KMGA13", publishedVersion: 2 }
  assert.deepEqual(activeRoomNotices([base, otherRoom], []), [base])
  assert.deepEqual(activeRoomNotices([base], [roomNoticeKey(base)]), [])
  assert.deepEqual(activeRoomNotices([moved], [roomNoticeKey(base)]), [moved])
  assert.deepEqual(activeRoomNotices([{ ...base, published: false }], []), [])
  assert.notEqual(roomNoticeKey({ ...base, eventId: "event-b" }), roomNoticeKey(base))
  assert.notEqual(tournamentStorageKey("event-a"), tournamentStorageKey("event-b"))
})

test("duplicate player submissions are blocked until an Admin reopens the round", () => {
  assert.equal(canPlayerSubmitRound(null), true)
  assert.equal(canPlayerSubmitRound(undefined), true)
  assert.equal(canPlayerSubmitRound("submitted"), false)
  assert.equal(canPlayerSubmitRound("verified"), false)
})

test("Eastern and player-local conversions account for November standard time", () => {
  const instant = new Date("2026-11-12T12:30:00Z")
  const eastern = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" }).format(instant)
  const local = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles", timeZoneName: "short" }).format(instant)
  assert.match(eastern, /7:30\s*AM\s*EST/)
  assert.match(local, /4:30\s*AM\s*PST/)
  const entered = dateTimeInputToUtc("2026-11-12T07:30", "America/New_York")
  assert.equal(entered, "2026-11-12T12:30:00.000Z")
  assert.equal(dateTimeInputInZone(entered!, "America/New_York"), "2026-11-12T07:30")
})

test("room builder records drive private drafts, member roster, notices, and room version refresh", () => {
  const rooms: RoomRecord[] = [
    { id: "room-11", eventId: "event-a", roundId: "r1", roomName: "KMGA11", course: "Gardens of Babylon", difficulty: "easy", startsAt: "2026-11-12T12:30:00Z", timeZone: "America/New_York", playerIds: ["demo-aria", "demo-blake"], capacity: 5, publishedVersion: 1, published: true },
    { id: "room-12", eventId: "event-a", roundId: "r1", roomName: "Practice Room", course: "Gardens of Babylon", difficulty: "easy", startsAt: "2026-11-12T13:00:00Z", timeZone: "America/New_York", playerIds: ["demo-casey"], capacity: 4, publishedVersion: 1, published: false },
    { id: "other-event", eventId: "event-b", roundId: "r1", roomName: "Secret Room", course: "Private Course", difficulty: "hard", startsAt: "2026-11-12T13:00:00Z", timeZone: "America/New_York", playerIds: ["demo-aria"], capacity: 4, publishedVersion: 1, published: true },
  ]
  const liveA = publishedRoomAssignments(rooms.filter((room) => room.eventId === "event-a"), MGA_DEMO_PLAYERS)
  assert.deepEqual(liveA.map((room) => room.playerId), ["demo-aria", "demo-blake"])
  assert.deepEqual(liveA[0].roomRoster, ["Aria Demo", "Blake Demo"])
  assert.equal(liveA.find((room) => room.playerId === "demo-aria")?.timeZone, "America/Los_Angeles")

  const moved = transferRoomPlayer(rooms, "event-a", "r1", "demo-aria", "room-12")
  assert.equal(moved.error, null)
  assert.deepEqual(moved.rooms.find((room) => room.id === "room-11")?.playerIds, ["demo-blake"])
  assert.deepEqual(moved.rooms.find((room) => room.id === "room-12")?.playerIds, ["demo-casey", "demo-aria"])
  assert.equal(publishedRoomAssignments(moved.rooms, MGA_DEMO_PLAYERS).some((room) => room.playerId === "demo-aria" && room.eventId === "event-a"), false)
  const republished = setRoomPublished(moved.rooms, "room-12", true)
  const ariaNotice = publishedRoomAssignments(republished, MGA_DEMO_PLAYERS).find((room) => room.playerId === "demo-aria" && room.eventId === "event-a")!
  assert.equal(ariaNotice.roomName, "Practice Room")
  assert.deepEqual(ariaNotice.roomRoster, ["Casey Demo", "Aria Demo"])
  assert.notEqual(roomNoticeKey(ariaNotice), roomNoticeKey({ ...ariaNotice, roomId: "old-room" }))

  const edited = updateRoomRecord(republished, "room-12", { roomName: "Sunday Group", startsAt: "2026-11-12T15:00:00Z" })
  const updatedNotice = publishedRoomAssignments(edited, MGA_DEMO_PLAYERS).find((room) => room.playerId === "demo-aria" && room.eventId === "event-a")!
  assert.equal(updatedNotice.roomName, "Sunday Group")
  assert.notEqual(roomNoticeKey(updatedNotice), roomNoticeKey(ariaNotice))
  assert.equal(publishedRoomAssignments(setRoomPublished(edited, "room-12", false), MGA_DEMO_PLAYERS).some((room) => room.playerId === "demo-aria" && room.eventId === "event-a"), false)
})

test("configured capacity can be raised above four without an implicit software cap", () => {
  const room: RoomRecord = { id: "large-room", eventId: "event-a", roundId: "r1", roomName: "Five Players", course: "Gardens of Babylon", difficulty: "easy", startsAt: "2026-11-12T12:30:00Z", timeZone: "America/New_York", playerIds: ["demo-aria", "demo-blake", "demo-casey", "demo-drew"], capacity: 4, publishedVersion: 1, published: true }
  const fifth = { id: "demo-erin", screenName: "Erin Demo", registrationId: "demo-reg-erin" }
  assert.equal(transferRoomPlayer([room], "event-a", "r1", fifth.id, "large-room").error, "Room is at capacity.")
  const increased = updateRoomRecord([room], "large-room", { capacity: 5 })
  const result = transferRoomPlayer(increased, "event-a", "r1", fifth.id, "large-room")
  assert.equal(result.error, null)
  assert.equal(result.rooms[0].playerIds.length, 5)
})

test("admin scoring route remains inside the site-admin protected app segment", () => {
  const adminLayout = readFileSync(new URL("../../app/admin/layout.tsx", import.meta.url), "utf8")
  assert.match(adminLayout, /permissions\.siteAdmin/)
})
