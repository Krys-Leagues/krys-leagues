import assert from "node:assert/strict"
import test from "node:test"
import { autoPlaceEntrants, bracketMatchCount, bracketRounds, generateSingleEliminationBracket, publicBracketProjection, recordBracketMatchResult, validateRegistrationCapacity } from "./bracketEngine.ts"

const player = (number: number) => ({ playerId: `${number.toString(16).padStart(8, "0")}-1111-4111-8111-${number.toString(16).padStart(12, "0")}`, displayName: `Player ${number}` })

test("generates the exact 32-player shape", () => {
  const bracket = generateSingleEliminationBracket({ id: "cup32", name: "5, 4, 3, 2, 1", size: 32, entrants: autoPlaceEntrants(Array.from({ length: 32 }, (_, index) => player(index + 1))) })
  assert.equal(bracketRounds(32), 5)
  assert.equal(bracket.matches.length, bracketMatchCount(32))
  assert.equal(bracket.matches.filter((match) => match.round === 5).length, 1)
})

test("generates the exact 64-player shape", () => {
  const bracket = generateSingleEliminationBracket({ id: "cup64", name: "Future Cup", size: 64, entrants: autoPlaceEntrants(Array.from({ length: 64 }, (_, index) => player(index + 1))) })
  assert.equal(bracketRounds(64), 6)
  assert.equal(bracket.matches.length, 63)
  assert.equal(bracket.matches.filter((match) => match.round === 6).length, 1)
})

test("enforces capacity and readiness", () => {
  assert.deepEqual(validateRegistrationCapacity(32, 31), { confirmedCount: 31, remainingPlaces: 1, ready: false })
  assert.deepEqual(validateRegistrationCapacity(64, 64), { confirmedCount: 64, remainingPlaces: 0, ready: true })
  assert.throws(() => validateRegistrationCapacity(32, 33), /full/)
  assert.throws(() => generateSingleEliminationBracket({ id: "cup", name: "Cup", size: 32, entrants: autoPlaceEntrants([player(1)]) }), /exactly 32/)
})

test("winner advancement and public history remain explicit", () => {
  let bracket = generateSingleEliminationBracket({ id: "cup", name: "Cup", size: 32, entrants: autoPlaceEntrants(Array.from({ length: 32 }, (_, index) => player(index + 1))), status: "live" })
  const first = bracket.matches.find((match) => match.round === 1 && match.matchNumber === 1)!
  const winner = bracket.entrants.find((entrant) => entrant.seed === 1)!
  bracket = recordBracketMatchResult(bracket, { matchId: first.id, winnerPlayerId: winner.playerId, scoreLabel: "2-1", evidenceReference: "private/result/1", verifiedByAuthUserId: player(99).playerId, recordedAt: "2026-10-25T12:00:00Z", idempotencyKey: "result-1", expectedRevision: bracket.revision })
  const secondRound = bracket.matches.find((match) => match.round === 2 && match.matchNumber === 1)!
  assert.equal(bracket.matches[0].result?.winnerPlayerId, winner.playerId)
  assert.equal(bracket.matches[0].result?.evidenceReference, "private/result/1")
  assert.equal(bracket.matches.find((match) => match.id === secondRound.id)?.slotA.type, "match")
  assert.equal(publicBracketProjection(bracket).matches.find((match) => match.id === secondRound.id)?.playerAName, winner.displayName)
})
