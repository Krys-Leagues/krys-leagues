import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(new URL("../../" + path, import.meta.url), "utf8")

test("Course Challenges opens on the approved welcome experience and direct course target", () => {
  const landing = read("components/course-challenges/CourseChallengesLanding.tsx")
  assert.match(landing, /course-challenges-welcome-approved\.png/)
  assert.match(landing, /className=\{styles\.courseNameLink\}/)
  assert.match(landing, /href=\{`\/course-challenges\/\$\{course\.slug\}`\}/)
})

test("profile summary omits empty sticker placeholder and keeps course name clickable", () => {
  const profile = read("components/course-challenges/CourseChallengesProfileSummary.tsx")
  assert.match(profile, /courseNameLink/)
  assert.doesNotMatch(profile, /No Level stickers earned yet/)
  assert.match(profile, /stickers\.length \?/) 
})

test("full book conceals unearned reward artwork with silhouettes and preserves Ace lock wording", () => {
  const book = read("components/course-challenges/CourseChallengeBook.tsx")
  assert.match(book, /earned && assetPath \? <Image/)
  assert.match(book, /rewardSilhouette/)
  assert.match(book, /maskImage/)
  assert.doesNotMatch(book, /🔒/)
  assert.match(book, /Unlocks after Level \{ace\.unlockAfterLevel\}/)
  assert.match(book, /DRAG YOUR SCORECARD HERE/)
  assert.match(book, /or tap to choose a photo/)
  assert.match(book, /Replace \/ Change/)
})

test("scorecard hotfix removes manual metadata inputs and supports compact signed entry", () => {
  const book = read("components/course-challenges/CourseChallengeBook.tsx")
  assert.doesNotMatch(book, /type="date"/)
  assert.doesNotMatch(book, /type="time"/)
  assert.doesNotMatch(book, /<select/)
  assert.match(book, /maxLength=\{2\}/)
  assert.match(book, /handleScoreKeyDown/)
  assert.match(book, /calculatedFinalScore/)
  assert.match(book, /finalScore: calculatedFinalScore/)
  assert.match(book, /CALCULATED FINAL SCORE/)
  assert.doesNotMatch(book, /finalScoreField/)
  assert.match(book, /focusNext\(index\)/)
})

test("fresh and repair SQL preserve private review fallback for missing proof metadata", () => {
  const foundation = read("course_challenges_foundation.sql")
  const repair = read("course_challenges_tester_ux_hotfix.sql")
  for (const source of [foundation, repair]) {
    assert.match(source, /entered_final_score/)
    assert.match(source, /final_score_check/)
  }
  assert.match(repair, /alter column round_date drop not null/)
  assert.match(repair, /alter column round_time drop not null/)
  assert.match(repair, /alter column game_mode drop not null/)
})

test("profile Course Challenges navigation has one entry and preserves the compact summary", () => {
  const profile = read("app/players/[id]/page.tsx")
  assert.match(profile, /<Link href="\/course-challenges" className=\{styles\.profileActionButton\}>Course Challenges<\/Link>/)
  assert.doesNotMatch(profile, /Course Challenge Collection/)
  assert.match(profile, /<CourseChallengesProfileSummary/)
  assert.match(profile, /href="\/players\?browse=1".*Player Profiles/)
})

test("welcome page keeps both safe back destinations and canonical Player Profile routing", () => {
  const landing = read("components/course-challenges/CourseChallengesLanding.tsx")
  assert.match(landing, /href="\/".*← Krys Leagues/)
  assert.match(landing, /← Player Profile/)
  assert.match(landing, /current_user_canonical_player_id/)
  assert.match(landing, /router\.push\("\/players\/"/)
  assert.doesNotMatch(landing, /auth\.uid|email|screen_name|display_name/)
})

test("approved welcome artwork is first page content and rules do not auto-open", () => {
  const landing = read("components/course-challenges/CourseChallengesLanding.tsx")
  assert.ok(landing.indexOf("heroImage") < landing.indexOf("courseList"))
  assert.doesNotMatch(landing, /useEffect/)
  assert.doesNotMatch(landing, /heroCopy/)
})

test("Tourist Trap book uses full-page scenery and starts with Rules / Help", () => {
  const book = read("components/course-challenges/CourseChallengeBook.tsx")
  const styles = read("components/course-challenges/course-challenges.module.css")
  assert.doesNotMatch(book, /courseHero|COURSE CHALLENGE BOOK|Levels 1–5 are visible together/)
  assert.match(book, /--course-background-image/)
  assert.match(book, /<summary>Rules \/ Help<\/summary>/)
  assert.match(styles, /\.page::before/)
  assert.match(styles, /var\(--course-background-image\)/)
})

test("scorecard entry is landscape-shaped and compact with pars beside each hole", () => {
  const book = read("components/course-challenges/CourseChallengeBook.tsx")
  const styles = read("components/course-challenges/course-challenges.module.css")
  assert.ok(book.includes("className={styles.holeLabel}"))
  assert.ok(book.includes("· Par {pars?.[index]"))
  assert.ok(styles.includes("aspect-ratio: 3 / 1"))
  assert.ok(styles.includes("grid-template-columns: repeat(9, minmax(46px, 1fr))"))
  assert.ok(styles.includes("width: 46px; height: 40px"))
  assert.ok(styles.includes("grid-template-columns: repeat(6, minmax(46px, 1fr)"))
})
