import assert from "node:assert/strict"
import test from "node:test"

import { resolveAuthoritativeCourse, type AuthoritativeCourse } from "./courseAuthority.ts"

const pars = Array.from({ length: 18 }, () => 3)
const courses: AuthoritativeCourse[] = [
  { id: "gloop-easy", code: "GLE", base_map: "Gloop Lair", display_name: "Gloop Lair Easy", difficulty: "Easy", hole_pars: pars, par: 54 },
  { id: "gloop-hard", code: "GLH", base_map: "Gloop Lair", display_name: "Gloop Lair Hard", difficulty: "Hard", hole_pars: pars, par: 54 },
  { id: "tiki-hard", code: "TCH", base_map: "Tiki à Coco", display_name: "Tiki à Coco Hard", difficulty: "Hard", hole_pars: pars, par: 54 },
  { id: "laser-easy", code: "LLE", base_map: "Laser Lair", display_name: "Laser Lair Easy", difficulty: "Easy", hole_pars: pars, par: 54 },
]

test("Season 63 shorthand resolves to the exact canonical course and difficulty", () => {
  assert.equal(resolveAuthoritativeCourse("GLOOP EASY", courses)?.id, "gloop-easy")
  assert.equal(resolveAuthoritativeCourse("TIKI HARD", courses)?.id, "tiki-hard")
  assert.equal(resolveAuthoritativeCourse("LASER EASY", courses)?.id, "laser-easy")
})

test("exact canonical display names and course codes remain supported", () => {
  assert.equal(resolveAuthoritativeCourse("Gloop Lair Hard", courses)?.id, "gloop-hard")
  assert.equal(resolveAuthoritativeCourse("LLE", courses)?.id, "laser-easy")
})

test("course authority fails closed for an ambiguous shorthand", () => {
  const ambiguous = [...courses, { ...courses[0], id: "gloop-grotto", base_map: "Gloop Grotto" }]
  assert.equal(resolveAuthoritativeCourse("GLOOP EASY", ambiguous), null)
  assert.equal(resolveAuthoritativeCourse("TI HARD", courses), null)
})
