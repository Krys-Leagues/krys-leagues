import assert from "node:assert/strict";
import test from "node:test";
import {
  assignPendingTrophyPlayer,
  clearPendingTrophyPlayer,
  monthlyTrophyNeedsPlacement,
  parsePendingTrophyAssignments,
  parsePendingTrophyMetadata,
  selectedTrophiesForReview,
  type PendingTrophyMatch,
  updatePendingTrophyMetadata,
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

test("placement and historical name corrections update only the chosen candidate", () => {
  const editable = [
    { key: "one", playerName: "", placement: "" },
    { key: "two", playerName: "Keep Me", placement: "1st" },
  ];
  const corrected = updatePendingTrophyMetadata(editable, "one", {
    playerName: "Legacy Name",
    placement: "2nd",
  });
  assert.deepEqual(corrected[0], {
    key: "one",
    playerName: "Legacy Name",
    placement: "2nd",
  });
  assert.deepEqual(corrected[1], editable[1]);
});

test("pending metadata safely round-trips explicit corrections", () => {
  assert.deepEqual(
    parsePendingTrophyMetadata(
      '{"asset:one":{"historicalName":"Legacy Name","placement":"2nd"}}',
    ),
    { "asset:one": { historicalName: "Legacy Name", placement: "2nd" } },
  );
});

test("Monthly trophies require placement but non-Monthly trophies do not", () => {
  const monthly = {
    ...candidates[1],
    eventType: "Monthly",
    placement: "",
  };
  const other = { ...monthly, eventType: "Cup", leagueType: "cup" };
  assert.equal(monthlyTrophyNeedsPlacement(monthly), true);
  assert.equal(validTrophiesForImport([monthly]).length, 0);
  assert.equal(monthlyTrophyNeedsPlacement(other), false);
  assert.equal(validTrophiesForImport([other]).length, 1);
});
