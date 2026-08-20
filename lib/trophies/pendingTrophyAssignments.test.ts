import assert from "node:assert/strict";
import test from "node:test";
import {
  assignPendingTrophyPlayer,
  clearPendingTrophyPlayer,
  parsePendingTrophyAssignments,
  selectedTrophiesForReview,
  type PendingTrophyMatch,
  validTrophiesForImport,
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

test("all 87 selected trophies appear in final review", () => {
  const selected = Array.from({ length: 87 }, (_, index) => ({
    ...candidates[1],
    key: `trophy-${index}`,
  }));
  assert.equal(selectedTrophiesForReview(selected).length, 87);
});

test("review includes unresolved trophies while final import includes only valid ones", () => {
  const review = selectedTrophiesForReview([
    candidates[1],
    { ...candidates[0], selected: true },
  ]);
  assert.equal(review.length, 2);
  assert.equal(validTrophiesForImport(review).length, 1);
  assert.equal(review[1].status, "needs-player");
});
