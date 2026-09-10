import assert from "node:assert/strict"
import test from "node:test"
import { extractTourneyBotNextData, normalizeTourneyBotData, type TourneyBotConfig } from "./tourneyBot.ts"

const config: TourneyBotConfig = { id: "71394", name: "The Decider From Hell", url: "https://tourneybot.gg/tourneys/71394" }

test("Tourney Bot adapter parses the public pageProps game/player shape", () => {
  const html = '<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"tourney":{"id":71394,"name":"The Decider From Hell","status":3,"participant_size":64},"games":[{"id":1,"round":1,"winner":"347781808928194560","player1":{"id":1,"name":"awinters86","score":0},"player2":{"id":64,"name":"mulligan3775","score":1}}],"players":[{"id":1,"name":"awinters86"},{"id":64,"name":"mulligan3775"}]}}}</script>'
  const preview = normalizeTourneyBotData(extractTourneyBotNextData(html), config)

  assert.equal(preview.name, "The Decider From Hell")
  assert.equal(preview.status, "Live")
  assert.equal(preview.participantCount, 64)
  assert.deepEqual(preview.participants, ["awinters86", "mulligan3775"])
  assert.deepEqual(preview.rounds[0].matches[0], { playerOne: "awinters86", playerTwo: "mulligan3775", scoreOne: "0", scoreTwo: "1", status: "Complete" })
})

test("Tourney Bot adapter keeps a graceful unavailable shape", () => {
  const preview = normalizeTourneyBotData({ id: "71394", status: "completed", champion: "Rising Kings", finalStandings: [{ position: 1, name: "Rising Kings", score: "5" }] }, config)
  assert.equal(preview.champion, "Rising Kings")
  assert.deepEqual(preview.standings, [{ place: "1", name: "Rising Kings", score: "5" }])
})
