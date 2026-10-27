import assert from "node:assert/strict"
import test from "node:test"
import { confirmWinner, createMockDiscordAdapter, downstreamMatchKeys, localOfferTimes, personalizeTrophy, proposeScheduleOffer, respondToScheduleOffer, scoreTournamentCard, canViewSecretPars } from "./workflow.ts"

const match = { id: "m1", playerA: "a", playerB: "b", status: "pending" as const, offers: [], confirmations: {} }
test("match center supports offers, counter, acceptance, and both local times", () => {
  const proposed = proposeScheduleOffer(match, "a", "2030-01-15T12:00", "America/New_York", "o1")
  const countered = respondToScheduleOffer(proposed, "b", "o1", "counter")
  assert.equal(countered.offers[0].status, "countered")
  const accepted = respondToScheduleOffer(countered, "b", "o1", "accept")
  assert.equal(accepted.offers[0].status, "accepted")
  const times = localOfferTimes(accepted.offers[0], "America/New_York", "Europe/London")
  assert.match(times.first, /2030/)
  assert.match(times.second, /2030/)
})

test("scorecard keeps horizontal 18-hole scoring deterministic", () => {
  const result = scoreTournamentCard(Array(18).fill(2), Array(18).fill(4), { eagle: 2 })
  assert.equal(result.total, 36)
  assert.equal(result.points, 36)
  assert.throws(() => scoreTournamentCard([2], Array(18).fill(4), {}), /18-hole/)
})

test("5, 4, 3, 2, 1 scoring gives a hole-in-one five points exactly once", () => {
  const scores = Array(18).fill(4)
  scores[0] = 1
  scores[1] = 2
  scores[2] = 3
  scores[3] = 4
  const result = scoreTournamentCard(scores, Array(18).fill(4), { holeInOne: 5, condor: 4, albatross: 3, eagle: 2, birdie: 1, par: 0 })
  assert.equal(result.points, 5 + 2 + 1)
})

test("matching winner confirmations complete and disagreement goes to review", () => {
  const first = confirmWinner(match, "a", "a")
  assert.equal(first.status, "pending")
  assert.equal(confirmWinner(first, "b", "a").status, "completed")
  assert.equal(confirmWinner(confirmWinner(match, "a", "a"), "b", "b").status, "review")
})

test("rewind impact lists downstream matches and secret pars are fail-closed", () => {
  assert.deepEqual(downstreamMatchKeys(1, 2, 32), ["r2m1", "r3m1", "r4m1", "r5m1"])
  assert.equal(canViewSecretPars("admin", "admin", ["admin"], ["admin"]), false)
  assert.equal(canViewSecretPars("admin", "admin", ["admin"], ["other"]), true)
})

test("trophy personalization preserves the original and returns a copy instruction", () => {
  assert.deepEqual(personalizeTrophy("private/original.png", "Winner", { x: 50, y: 80, fontSize: 32, color: "#fff" }).copyRequired, true)
})

test("Discord remains safe when credentials are unavailable", async () => {
  assert.deepEqual(await createMockDiscordAdapter(false).createPrivateThread({ matchId: "m1", playerIds: ["a", "b"], body: "rules" }), { status: "not_configured", reason: "Discord credentials are not configured" })
})
