import assert from "node:assert/strict"
import test from "node:test"
import { resolveCourseKey, resolveCourseKeys } from "./courseKeyResolver.ts"

const catalog = [
  { id: "wwe-easy", baseMap: "Widow's Walkabout", difficulty: "easy" as const },
  { id: "wwe-hard", baseMap: "Widow's Walkabout", difficulty: "hard" as const },
  { id: "temple-easy", baseMap: "Temple at Zerzura", difficulty: "easy" as const },
]

test("exact catalog name preserves Easy/Hard and resolves deterministically", () => {
  const result = resolveCourseKey(
    { rawCourseKey: "Widow's Walkabout_hard", rawCourseName: "Widow's Walkabout", difficulty: "Hard" },
    catalog,
  )
  assert.equal(result.status, "resolved")
  assert.equal(result.officialCourseId, "wwe-hard")
  assert.equal(result.difficulty, "hard")
})

test("known course id wins over a display-name variation", () => {
  const result = resolveCourseKey(
    { rawCourseKey: "legacy_name_easy", rawCourseName: "legacy_name", difficulty: "easy", courseId: "temple-easy" },
    catalog,
  )
  assert.equal(result.status, "resolved")
  assert.equal(result.reason, "EXACT_COURSE_ID")
  assert.equal(result.officialBaseMap, "Temple at Zerzura")
})

test("uncertain historical aliases are exceptions, not fuzzy matches", () => {
  const results = resolveCourseKeys(
    [
      { rawCourseKey: "Raptor Cliff_easy", rawCourseName: "Raptor Cliff", difficulty: "easy" },
      { rawCourseKey: "undefined_hard", difficulty: "hard" },
      { rawCourseKey: "Temple at Zerzura_hard", rawCourseName: "Temple at Zerzura", difficulty: "hard" },
    ],
    catalog,
  )
  assert.deepEqual(results.map((result) => result.status), ["unresolved", "unresolved", "unresolved"])
  assert.equal(results[0].reason, "NO_EXACT_CATALOG_MATCH")
  assert.equal(results[1].reason, "NO_EXACT_CATALOG_MATCH")
  assert.equal(results[2].reason, "NO_EXACT_CATALOG_MATCH")
})

test("invalid difficulty is reported without inventing a course mapping", () => {
  const result = resolveCourseKey({ rawCourseKey: "Widow's Walkabout_medium" }, catalog)
  assert.equal(result.status, "unresolved")
  assert.equal(result.reason, "INVALID_DIFFICULTY")
})

test("course id and difficulty mismatch is not silently repaired", () => {
  const result = resolveCourseKey(
    { rawCourseKey: "Temple at Zerzura_hard", difficulty: "hard", courseId: "temple-easy" },
    catalog,
  )
  assert.equal(result.status, "unresolved")
  assert.equal(result.reason, "COURSE_ID_DIFFICULTY_MISMATCH")
})
