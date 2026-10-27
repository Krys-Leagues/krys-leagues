import assert from "node:assert/strict"
import test from "node:test"
import {
  MATCH_GAME_DIFFICULTIES,
  chooseDistinctMatchCourseOptions,
  filterEligibleMatchCourses,
  isMatchMapLocked,
  preserveCommittedMatchCourse,
  requiredMatchCourseDifficulty,
  resolveMatchCourseChoice,
  type MatchCourseCandidate,
} from "./matchCoursePicker.ts"

const catalog: MatchCourseCandidate[] = [
  { code: "AL-E", baseMap: "Alfheim", difficulty: "Easy", displayName: "Alfheim Easy", active: true, releaseDate: "2026-01-01" },
  { code: "AL-H", baseMap: "Alfheim", difficulty: "Hard", displayName: "Alfheim Hard", active: true, releaseDate: "2026-01-01" },
  { code: "CH-E", baseMap: "Cherry Blossom", difficulty: "Easy", displayName: "Cherry Blossom Easy", active: true, releaseDate: "2026-01-01" },
  { code: "CH-H", baseMap: "Cherry Blossom", difficulty: "Hard", displayName: "Cherry Blossom Hard", active: true, releaseDate: "2026-01-01" },
  { code: "ME-E", baseMap: "Meow Wolf", difficulty: "Easy", displayName: "Meow Wolf Easy", active: true, releaseDate: "2026-01-01" },
  { code: "ME-H", baseMap: "Meow Wolf", difficulty: "Hard", displayName: "Meow Wolf Hard", active: true, releaseDate: "2026-01-01" },
  { code: "FUT-E", baseMap: "Future Map", difficulty: "Easy", displayName: "Future Map Easy", active: true, releaseDate: "2026-12-01" },
  { code: "OFF-E", baseMap: "Offline Map", difficulty: "Easy", displayName: "Offline Map Easy", active: false, releaseDate: "2026-01-01" },
]

test("uses only eligible courses and omits blocked maps", () => {
  const eligible = filterEligibleMatchCourses(catalog, "Easy", ["Cherry Blossom"], new Date("2026-10-07T00:00:00Z"))
  assert.deepEqual(eligible.map((course) => course.code), ["AL-E", "ME-E"])
})

test("reveals three distinct eligible options when the catalog allows it", () => {
  const expanded = [...catalog, { code: "TO-E", baseMap: "Tokyo", difficulty: "Easy" as const, displayName: "Tokyo Easy", active: true, releaseDate: "2026-01-01" }]
  const options = chooseDistinctMatchCourseOptions(expanded, "Easy", [], () => 0.1)
  assert.equal(options.length, 3)
  assert.equal(new Set(options.map((course) => course.code)).size, 3)
})

test("enforces Easy, Hard, Easy", () => {
  assert.deepEqual(MATCH_GAME_DIFFICULTIES, ["Easy", "Hard", "Easy"])
  assert.equal(requiredMatchCourseDifficulty(1), "Easy")
  assert.equal(requiredMatchCourseDifficulty(2), "Hard")
  assert.equal(requiredMatchCourseDifficulty(3), "Easy")
})

test("same player choice resolves directly", () => {
  const choice = { code: "AL-E", baseMap: "Alfheim", difficulty: "Easy" as const, displayName: "Alfheim Easy" }
  assert.equal(resolveMatchCourseChoice(choice, choice).code, "AL-E")
})

test("different player choices randomize only between those two", () => {
  const first = { code: "AL-E", baseMap: "Alfheim", difficulty: "Easy" as const, displayName: "Alfheim Easy" }
  const second = { code: "CH-E", baseMap: "Cherry Blossom", difficulty: "Easy" as const, displayName: "Cherry Blossom Easy" }
  assert.equal(resolveMatchCourseChoice(first, second, () => 0.1).code, "AL-E")
  assert.equal(resolveMatchCourseChoice(first, second, () => 0.9).code, "CH-E")
})

test("underlying map lock applies across Easy and Hard variants", () => {
  const selected = { code: "CH-E", baseMap: "Cherry Blossom", difficulty: "Easy" as const, displayName: "Cherry Blossom Easy" }
  const hardVariant = { code: "CH-H", baseMap: "Cherry Blossom", difficulty: "Hard" as const, displayName: "Cherry Blossom Hard" }
  assert.equal(isMatchMapLocked(hardVariant, [selected]), true)
})

test("committed selection is never replaced by a later proposal", () => {
  const committed = { code: "AL-E", baseMap: "Alfheim", difficulty: "Easy" as const, displayName: "Alfheim Easy" }
  const proposed = { code: "ME-E", baseMap: "Meow Wolf", difficulty: "Easy" as const, displayName: "Meow Wolf Easy" }
  assert.equal(preserveCommittedMatchCourse(committed, proposed), committed)
  assert.equal(preserveCommittedMatchCourse(null, proposed), proposed)
})
