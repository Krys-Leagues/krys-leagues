import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { playFormatRuleForAce, playFormatRuleForLevel, playFormatRuleForPrestige } from "./playFormat.ts"

const read = (path: string) => readFileSync(new URL("../../" + path, import.meta.url), "utf8")

test("Course Challenge play-format labels match the approved display rules", () => {
  assert.deepEqual([1, 2, 3].map(playFormatRuleForLevel), ["SOLO PLAY ALLOWED", "SOLO PLAY ALLOWED", "SOLO PLAY ALLOWED"])
  assert.deepEqual([4, 5].map(playFormatRuleForLevel), ["MULTIPLAYER ROOM REQUIRED", "MULTIPLAYER ROOM REQUIRED"])
  assert.equal(playFormatRuleForPrestige("course-pro"), "MULTIPLAYER ROOM REQUIRED")
  assert.equal(playFormatRuleForPrestige("course-master"), "MULTIPLAYER ROOM REQUIRED")
  assert.equal(playFormatRuleForAce("wader"), "SOLO PLAY ALLOWED")
  assert.equal(playFormatRuleForAce("chaser"), "SOLO PLAY ALLOWED")
  assert.equal(playFormatRuleForAce("hunter"), "MULTIPLAYER OR NAMED SOLO ROOM REQUIRED")
  assert.equal(playFormatRuleForAce("legend"), "MULTIPLAYER OR NAMED SOLO ROOM REQUIRED")
})

test("play-format rules are shared display labels, not automated gates", () => {
  const book = read("components/course-challenges/CourseChallengeBook.tsx")
  const evaluation = read("lib/courseChallenges/evaluation.ts")
  assert.match(book, /COURSE REQUIREMENTS/)
  assert.match(book, /className=\{styles\.playFormatRequirement\}/)
  assert.match(book, /<strong>\{playFormatRule\}<\/strong>/)
  assert.match(book, /playFormatRuleForLevel\(selectedLevelData\.level\)/)
  assert.match(book, /playFormatRuleForAce\(currentAceStage\.key\)/)
  assert.doesNotMatch(book, /PLAY FORMAT · ADMIN-ENFORCED/)
  assert.doesNotMatch(book, /This display rule explains the intended play format/)
  assert.doesNotMatch(evaluation, /playFormatRule|MULTIPLAYER ROOM REQUIRED|SOLO PLAY ALLOWED|NAMED SOLO ROOM REQUIRED/)
  assert.doesNotMatch(book, /if \(.*gameMode|gameMode.*playFormatRule|playFormatRule.*gameMode/)
})
