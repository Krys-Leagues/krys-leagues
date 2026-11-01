import assert from "node:assert/strict"
import test from "node:test"
import { buildCanonicalPublicPlayerChoices } from "./publicPlayerChoices.ts"

function player(id: string, screenName: string, active = true, status = "active") {
  return {
    id,
    screen_name: screenName,
    status,
    active,
    avatar_path: `/avatars/${id}.png`,
    is_server_booster: true,
    has_krys_server_tag: false,
    profile_badges: ["Owner"],
  }
}

test("one canonical choice represents a family with multiple retired identities", () => {
  const keep = player("keep", "BIGJA")
  const retiredOne = player("old-1", "BIGJA33", false, "merged")
  const retiredTwo = player("old-2", "BIGJA OLD", false, "retired")
  const choices = buildCanonicalPublicPlayerChoices(
    [keep, retiredOne, retiredTwo],
    [
      { canonical_player_id: "keep", identity_player_ids: ["keep", "old-1", "old-2"] },
      { canonical_player_id: "keep", identity_player_ids: ["keep", "old-1", "old-2"] },
      { canonical_player_id: "keep", identity_player_ids: ["keep", "old-1", "old-2"] },
    ],
  )

  assert.equal(choices.length, 1)
  assert.equal(choices[0].id, "keep")
  assert.deepEqual(choices[0].identity_player_ids, ["keep", "old-1", "old-2"])
  assert.equal(choices[0].avatar_path, "/avatars/keep.png")
  assert.deepEqual(choices[0].profile_badges, ["Owner"])
})

test("similar names and aliases do not collapse distinct canonical UUIDs", () => {
  const choices = buildCanonicalPublicPlayerChoices(
    [player("one", "Raccoons_whisker"), player("two", "RACCOONS WHISKER")],
    [
      { canonical_player_id: "one", identity_player_ids: ["one"] },
      { canonical_player_id: "two", identity_player_ids: ["two"] },
    ],
  )
  assert.deepEqual(choices.map((choice) => choice.id).sort(), ["one", "two"])
})

test("inactive canonical and active-but-linked historical rows are not selectable", () => {
  const choices = buildCanonicalPublicPlayerChoices(
    [player("inactive", "Inactive", false), player("historical", "Historical")],
    [
      { canonical_player_id: "inactive", identity_player_ids: ["inactive"] },
      { canonical_player_id: "keep", identity_player_ids: ["keep", "historical"] },
    ],
  )
  assert.deepEqual(choices, [])
})

test("an ordinary active canonical player without aliases remains selectable", () => {
  const choices = buildCanonicalPublicPlayerChoices(
    [player("plain", "Plain Player")],
    [{ canonical_player_id: "plain", identity_player_ids: null }],
  )
  assert.equal(choices[0].id, "plain")
  assert.deepEqual(choices[0].identity_player_ids, ["plain"])
})
