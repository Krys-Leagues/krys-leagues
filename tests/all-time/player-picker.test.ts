import assert from "node:assert/strict"
import test from "node:test"
import { filterCanonicalCourses, filterCanonicalPlayers, formatCanonicalCourse, normalizeCanonicalCourseDisplayName } from "../../lib/all-time/player-picker.ts"

const players = [
  { id: "bigja", screen_name: "BIGJA33" },
  { id: "jim", screen_name: "5.0JIM" },
  { id: "birdman", screen_name: "Birdman of London" },
  { id: "princess", screen_name: "PRINCESS_BANKSHOT" },
]

test("canonical player search is case-insensitive, partial, and punctuation-safe", () => {
  assert.deepEqual(filterCanonicalPlayers(players, "bigja").map((player) => player.id), ["bigja"])
  assert.deepEqual(filterCanonicalPlayers(players, "5.0").map((player) => player.id), ["jim"])
  assert.deepEqual(filterCanonicalPlayers(players, "london").map((player) => player.id), ["birdman"])
  assert.deepEqual(filterCanonicalPlayers(players, "princess_").map((player) => player.id), ["princess"])
})

test("blank canonical player search has no giant native-list replacement", () => {
  assert.deepEqual(filterCanonicalPlayers(players, ""), [])
  assert.deepEqual(filterCanonicalPlayers(players, "a", 2).map((player) => player.id), ["bigja", "birdman"])
})

const courses = [
  { id: "cherry-e", code: "CBE", display_name: "Cherry Blossom", difficulty: "Easy" as const },
  { id: "cherry-h", code: "CBH", display_name: "Cherry Blossom", difficulty: "Hard" as const },
  { id: "gloop-e", code: "GLE", display_name: "Gloop Lair", difficulty: "Easy" as const },
]

test("canonical course search matches names and codes while preserving difficulty", () => {
  assert.deepEqual(filterCanonicalCourses(courses, "cherry").map((course) => course.id), ["cherry-e", "cherry-h"])
  assert.deepEqual(filterCanonicalCourses(courses, "gle").map((course) => course.id), ["gloop-e"])
  assert.equal(formatCanonicalCourse(courses[0]), "Cherry Blossom — Easy")
  assert.equal(formatCanonicalCourse({ ...courses[0], display_name: "Cherry Blossom Easy" }), "Cherry Blossom Easy")
})

test("Widow's Walkabout display repair preserves both course identities", () => {
  const easy = { id: "wwe-id", code: "WWE", display_name: "Widowâ€™s Walkabout Easy", difficulty: "Easy" as const }
  const hard = { id: "wwh-id", code: "WWH", display_name: "Widowâ€™s Walkabout Hard", difficulty: "Hard" as const }

  assert.equal(formatCanonicalCourse(easy), "Widow’s Walkabout Easy")
  assert.equal(formatCanonicalCourse(hard), "Widow’s Walkabout Hard")
  assert.doesNotMatch(formatCanonicalCourse(easy), /â€™/)
  assert.doesNotMatch(formatCanonicalCourse(hard), /â€™/)
  assert.equal(normalizeCanonicalCourseDisplayName("Cherry Blossom"), "Cherry Blossom")
  assert.equal(easy.id, "wwe-id")
  assert.equal(easy.code, "WWE")
  assert.equal(hard.id, "wwh-id")
  assert.equal(hard.code, "WWH")
})
