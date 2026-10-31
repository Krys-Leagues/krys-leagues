import test from "node:test"
import assert from "node:assert/strict"
import { buildMastersLiveStats, type MastersLiveStatsCard } from "./mastersLiveStats.ts"

const entry = { entryId: "e1", playerId: "p1", name: "BadWolf" }
const holes = (strokes: number, par = 3) => Array.from({ length: 18 }, (_, index) => ({ holeNumber: index + 1, par, strokes }))
const card = (day: string, status: "submitted" | "verified" = "verified", strokes = 3, holeRows = holes(strokes)): MastersLiveStatsCard => ({ entryId: "e1", playDayId: day, dayNumber: Number(day) as 1 | 2 | 3 | 4, status, scoreToPar: -18, holes: holeRows })
const base = (cards: MastersLiveStatsCard[] = [card("1")]) => ({ now: new Date("2026-10-02T12:00:00Z"), cards, entries: [entry], choices: [{ entryId: "e1", playDayId: "1", timeSlotId: "t1" }], timeSlots: [{ id: "t1", playDayId: "1", startsAt: "2026-10-01T12:00:00Z" }] })

test("counts authoritative verified hole categories and preserves negative totals", () => {
  const rows = buildMastersLiveStats(base([card("1", "verified", 1)]) )
  assert.equal(rows.aces[0].count, 18); assert.equal(rows.eagles[0].count, 18); assert.equal(rows.birdies.length, 0); assert.equal(rows.pars.length, 0)
})
test("submitted cards are excluded from every stat", () => { assert.deepEqual(buildMastersLiveStats(base([card("1", "submitted")])).aces, []) })
test("bogey-free requires a complete clean card for every occurred round", () => {
  const second = { ...card("2"), playDayId: "2", dayNumber: 2 as const }
  const clean = buildMastersLiveStats({ ...base([card("1"), second]), choices: [...base().choices, { entryId: "e1", playDayId: "2", timeSlotId: "t2" }], timeSlots: [...base().timeSlots, { id: "t2", playDayId: "2", startsAt: "2026-10-02T11:00:00Z" }] })
  assert.equal(clean.bogeyFree[0].verifiedHoles, 36)
  const incomplete = buildMastersLiveStats(base([{ ...card("1"), holes: holes(3).slice(0, 17) }]))
  assert.deepEqual(incomplete.bogeyFree, [])
})
test("future selected rounds do not disqualify bogey-free", () => {
  const result = buildMastersLiveStats({ ...base(), choices: [...base().choices, { entryId: "e1", playDayId: "2", timeSlotId: "future" }], timeSlots: [...base().timeSlots, { id: "future", playDayId: "2", startsAt: "2026-10-03T12:00:00Z" }] })
  assert.equal(result.bogeyFree[0].verifiedHoles, 18)
})
test("a missed occurred round excludes only bogey-free", () => {
  const result = buildMastersLiveStats({ ...base([card("1")]), choices: [...base().choices, { entryId: "e1", playDayId: "2", timeSlotId: "missed" }], timeSlots: [...base().timeSlots, { id: "missed", playDayId: "2", startsAt: "2026-10-02T11:00:00Z" }] })
  assert.equal(result.pars[0].count, 18); assert.deepEqual(result.bogeyFree, [])
})
test("ties include every player tied through third", () => {
  const entries = [entry, { entryId: "e2", playerId: "p2", name: "Alpha" }, { entryId: "e3", playerId: "p3", name: "Bravo" }, { entryId: "e4", playerId: "p4", name: "Charlie" }]
  const result = buildMastersLiveStats({ ...base([card("1", "verified", 1)]), entries, cards: [card("1", "verified", 1), ...["e2", "e3", "e4"].map((id) => ({ ...card("1", "verified", 1), entryId: id }))] })
  assert.equal(result.aces.length, 4); assert.ok(result.aces.every((row) => row.rank === 1))
})
test("stats endpoint is admin-only, read-only, and has no polling", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/api/admin/majors/live-stats/route.ts", import.meta.url), "utf8"))
  assert.match(source, /authorizeSiteAdminMutation\(\)/); assert.match(source, /createScorecardServiceClient\(\)/); assert.match(source, /Cache-Control/)
  assert.doesNotMatch(source, /insert\(|update\(|delete\(/); assert.doesNotMatch(source, /setInterval|setTimeout|poll/i)
})
test("stats page loads once and refreshes only by explicit button", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/admin/majors/stats/page.tsx", import.meta.url), "utf8"))
  assert.match(source, /MASTERS/); assert.match(source, /REFRESH STATS/); assert.match(source, /api\/admin\/majors\/live-stats/); assert.doesNotMatch(source, /setInterval|setTimeout/)
})
