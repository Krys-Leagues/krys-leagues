import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8")

test("Our Mission is a permanent player-facing area with the approved philosophy", () => {
  const page = read("app/our-mission/page.tsx")
  const styles = read("app/our-mission/page.module.css")
  for (const phrase of [
    "OUR MISSION",
    "every player belongs",
    "level that feels fair",
    "Ranks separate the competition",
    "If you get stuck, ask us.",
    "Course Challenges are another part of that mission.",
    "Play together. Compete at your level. Learn from each other. Keep improving.",
    "There should always be a place for you here.",
  ]) {
    assert.ok(page.toLowerCase().includes(phrase.toLowerCase()), phrase)
  }
  assert.match(page, /className=\{styles\.headingRow\}/)
  assert.match(page, /src="\/krys-leagues-logo\.png"/)
  assert.match(page, /className=\{styles\.callout\}/)
  assert.match(styles, /@media/)
})

test("Course Challenges links to the permanent Mission area", () => {
  const landing = read("components/course-challenges/CourseChallengesLanding.tsx")
  assert.match(landing, /href="\/our-mission".*Our Mission/)
})

test("Monthlies presents the mission tagline without changing its data flow", () => {
  const monthlies = read("app/monthlies/page.tsx")
  const styles = read("app/monthlies/page.module.css")
  assert.match(monthlies, /missionTagline/)
  assert.match(monthlies, /Ranks separate the competition — not the players\./)
  assert.match(styles, /\.missionTagline/)
  assert.match(monthlies, /fetch\("\/api\/monthlies\/public\?metadataOnly=true"/)
  assert.match(monthlies, /params\.toString\(\)/)
})