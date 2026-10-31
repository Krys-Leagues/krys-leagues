import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  buildMastersSplitLeaderboards,
  MASTERS_SPLIT_CUT_LINE,
  type MastersSplitPlayer,
} from "./mastersSplitLeaderboards.ts"

function player(
  entry: number,
  round1: number | null,
  round2: number | null,
  round3: number | null = null,
  round4: number | null = null,
  entryStatus: string | null = "confirmed",
): MastersSplitPlayer {
  return {
    entryId: `entry-${entry}`,
    playerId: `player-${entry}`,
    name: `PLAYER_${entry}`,
    entryStatus,
    rounds: {
      1: { score: round1, status: round1 === null ? null : "verified" },
      2: { score: round2, status: round2 === null ? null : "verified" },
      3: { score: round3, status: round3 === null ? null : "verified" },
      4: { score: round4, status: round4 === null ? null : "verified" },
    },
  }
}

test("only players with both Easy rounds are eligible for the split", () => {
  const result = buildMastersSplitLeaderboards([player(1, -24, -23), player(2, -24, null), player(3, null, -23)])
  assert.equal(result.eligiblePlayers.length, 1)
  assert.equal(result.unclassified.length, 2)
})

test("49 eligible players produce the historical 30 / 19 split", () => {
  const players = [
    ...Array.from({ length: 30 }, (_, index) => player(index + 1, -24, -23)),
    ...Array.from({ length: 19 }, (_, index) => player(index + 31, -23, -23)),
  ]
  const result = buildMastersSplitLeaderboards(players)
  assert.equal(result.eligiblePlayers.length, 49)
  assert.equal(result.top60.length, 30)
  assert.equal(result.bottom40.length, 19)
})

test("the historical cut line is -47", () => {
  assert.equal(MASTERS_SPLIT_CUT_LINE, -47)
})

test("-47 is Top 60 and -46 is Bottom 40", () => {
  const result = buildMastersSplitLeaderboards([player(1, -24, -23), player(2, -23, -23)])
  assert.equal(result.top60[0]?.round2Total, -47)
  assert.equal(result.bottom40[0]?.round2Total, -46)
})

test("group membership is frozen after Round 2", () => {
  const result = buildMastersSplitLeaderboards([
    player(1, -24, -23, 20, 20),
    player(2, -23, -23, -20, -20),
  ])
  assert.equal(result.top60[0]?.entryId, "entry-1")
  assert.equal(result.bottom40[0]?.entryId, "entry-2")
})

test("Round 3 cannot move a player between groups", () => {
  const result = buildMastersSplitLeaderboards([player(1, -24, -23, 40), player(2, -23, -23, -40)])
  assert.equal(result.top60.map((row) => row.entryId).join(","), "entry-1")
  assert.equal(result.bottom40.map((row) => row.entryId).join(","), "entry-2")
})

test("Round 4 cannot move a player between groups", () => {
  const result = buildMastersSplitLeaderboards([player(1, -24, -23, 40, 40), player(2, -23, -23, -40, -40)])
  assert.equal(result.top60[0]?.group, "top_60")
  assert.equal(result.bottom40[0]?.group, "bottom_40")
})

test("Top 60 rank uses the final total only within Top 60", () => {
  const result = buildMastersSplitLeaderboards([
    player(1, -24, -23, 0, 0),
    player(2, -24, -23, -5, -5),
    player(3, -24, -23, -30, -30),
  ])
  assert.deepEqual(result.top60.map((row) => [row.entryId, row.overall, row.rank]), [
    ["entry-3", -107, "1"],
    ["entry-2", -57, "2"],
    ["entry-1", -47, "3"],
  ])
})

test("Bottom 40 rank uses the final total only within Bottom 40", () => {
  const result = buildMastersSplitLeaderboards([
    player(1, -23, -23, 0, 0),
    player(2, -22, -24, -5, -5),
  ])
  assert.deepEqual(result.bottom40.map((row) => [row.entryId, row.overall, row.rank]), [
    ["entry-2", -56, "1"],
    ["entry-1", -46, "2"],
  ])
})

test("more-negative totals rank higher", () => {
  const result = buildMastersSplitLeaderboards([player(1, -24, -23, -2), player(2, -24, -23, -1)])
  assert.equal(result.top60[0]?.entryId, "entry-1")
})

test("ties receive tied ranks", () => {
  const result = buildMastersSplitLeaderboards([
    player(1, -24, -23, -2),
    player(2, -24, -23, -2),
    player(3, -24, -23, 0),
  ])
  assert.deepEqual(result.top60.map((row) => row.rank), ["T1", "T1", "3"])
})

test("missing Round 3 and Round 4 are not treated as zero", () => {
  const result = buildMastersSplitLeaderboards([player(1, -24, -23)])
  assert.equal(result.top60[0]?.overall, -47)
  assert.equal(result.top60[0]?.completedRoundCount, 2)
  assert.equal(result.top60[0]?.resultStatus, "INCOMPLETE")
})

test("incomplete Round-2 players remain separately visible", () => {
  const result = buildMastersSplitLeaderboards([player(1, -24, null, -10), player(2, null, null)])
  assert.deepEqual(result.unclassified.map((row) => row.entryId), ["entry-1", "entry-2"])
})

test("Ranking Points is structural and has no scoring logic", () => {
  const result = buildMastersSplitLeaderboards([player(1, -24, -23)])
  assert.equal(result.top60[0]?.rankingPoints, null)
  assert.equal(result.bottom40[0], undefined)
})

test("the API and page are admin-only and read-only", () => {
  const route = readFileSync(new URL("../app/api/admin/majors/split-leaderboards/route.ts", import.meta.url), "utf8")
  const page = readFileSync(new URL("../app/admin/majors/split-leaderboards/page.tsx", import.meta.url), "utf8")
  assert.match(route, /authorizeSiteAdminMutation/)
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.delete\(/)
  assert.match(page, /MASTERS — TOP 60% RESULTS/)
  assert.match(page, /RANKING POINTS/)
})

test("public Masters results remain free of the admin split tool", () => {
  const publicPage = readFileSync(new URL("../app/majors/[slug]/results/page.tsx", import.meta.url), "utf8")
  assert.doesNotMatch(publicPage, /split-leaderboards|TOP 60% RESULTS|BOTTOM 40% RESULTS/)
})
