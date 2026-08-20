import assert from "node:assert/strict";
import test from "node:test";
import {
  assignPendingTrophyPlayer,
  clearPendingTrophyPlayer,
  parsePendingTrophyAssignments,
  type PendingTrophyMatch,
} from "./pendingTrophyAssignments.ts";

const candidates: PendingTrophyMatch[] = [
  { key: "one", playerId: null, status: "needs-player", selected: false, manuallyReviewed: false, manualPlayerId: null },
  { key: "two", playerId: "original", status: "ready", selected: true, manuallyReviewed: true, manualPlayerId: "original" },
];

test("an explicit player result assigns only its exact trophy", () => {
  const result = assignPendingTrophyPlayer(candidates, "one", "canonical-player-id");
  assert.equal(result[0].playerId, "canonical-player-id");
  assert.equal(result[0].manualPlayerId, "canonical-player-id");
  assert.equal(result[0].status, "ready");
  assert.equal(result[1].playerId, "original");
});

test("an explicit correction replaces only the chosen pending assignment", () => {
  const result = assignPendingTrophyPlayer(candidates, "two", "corrected-id");
  assert.equal(result[1].playerId, "corrected-id");
  assert.equal(result[0].playerId, null);
});

test("clear player returns only that trophy to Needs Player", () => {
  const result = clearPendingTrophyPlayer(candidates, "two");
  assert.equal(result[1].playerId, null);
  assert.equal(result[1].status, "needs-player");
  assert.equal(result[1].selected, false);
  assert.equal(result[0].status, "needs-player");
});

test("pending browser assignments preserve canonical IDs and intentional clears", () => {
  assert.deepEqual(
    parsePendingTrophyAssignments('{"one":"canonical-id","two":null}'),
    { one: "canonical-id", two: null },
  );
  assert.deepEqual(parsePendingTrophyAssignments("not json"), {});
});
