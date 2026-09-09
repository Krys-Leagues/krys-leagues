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
  assert.match(book, /rewardState === "earned"/)
  assert.match(book, /rewardState === "current"/)
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

test("first-time intro is dismissible and Rules / Help remains available", () => {
  const landing = read("components/course-challenges/CourseChallengesLanding.tsx")
  assert.ok(landing.indexOf("heroImage") < landing.indexOf("courseList"))
  assert.match(landing, /INTRO_STORAGE_KEY/)
  assert.match(landing, /localStorage/)
  assert.ok(landing.includes('Rules / Help'))
  assert.match(landing, /CourseChallengesGuide/)
  assert.doesNotMatch(landing, /heroCopy/)
})

test("Tourist Trap book uses full-page scenery and starts with Rules / Help", () => {
  const book = read("components/course-challenges/CourseChallengeBook.tsx")
  const styles = read("components/course-challenges/course-challenges.module.css")
  assert.doesNotMatch(book, /courseHero|COURSE CHALLENGE BOOK|Levels 1–5 are visible together/)
  assert.match(book, /<h1 className=\{styles\.courseTitle\}>\{course\.name\}<\/h1>/)
  assert.match(book, /--course-background-image/)
  assert.match(book, /<summary>Rules \/ Help<\/summary>/)
  assert.match(styles, /\.page::before/)
  assert.match(styles, /\.courseTitle/)
  assert.match(styles, /linear-gradient\(180deg, #02061714, #0206172e 72%, #02061740\), var\(--course-background-image\)/)
  assert.match(styles, /var\(--course-background-image\)/)
})

test("level rail is interactive single-view navigation with locked states", () => {
  const book = read("components/course-challenges/CourseChallengeBook.tsx")
  const styles = read("components/course-challenges/course-challenges.module.css")
  assert.match(book, /const \[selectedLevel, setSelectedLevel\] = useState\(1\)/)
  assert.match(book, /onClick=\{\(\) => setSelectedLevel\(level\.level\)\}/)
  assert.match(book, /data-selected=\{selectedLevel === level\.level\}/)
  assert.match(book, /course\.levels\.find\(\(level\) => level\.level === selectedLevel\)/)
  assert.match(book, /Complete Level " \+ \(selectedLevelData\.level - 1\) \+ " to unlock this Level\./)
  assert.match(book, /selectedLevelData\.level === \(ace\?\.unlockAfterLevel \|\| 3\)/)
  assert.match(styles, /\.levelTab\[data-selected="true"\]/)
  assert.match(styles, /\.lockedLevelView/)
})

test("prestige rewards remain at the bottom of every selected view and background scrolls naturally", () => {
  const book = read("components/course-challenges/CourseChallengeBook.tsx")
  const styles = read("components/course-challenges/course-challenges.module.css")
  assert.match(book, /in place of your avatar/)
  assert.match(styles, /position: absolute/)
  assert.match(styles, /background-attachment: scroll/)
  assert.match(styles, /background-size: 100% auto/)
})
test("scorecard entry reuses the All-Time HOLE/PAR/SCORE pattern", () => {
  const book = read("components/course-challenges/CourseChallengeBook.tsx")
  const styles = read("components/admin/records/NormalScorecard.module.css")
  assert.match(book, /NormalScorecard\.module\.css/)
  assert.match(book, /className=\{scorecardStyles\.scorecard\}/)
  assert.match(book, /<th scope="row">HOLE<\/th>/)
  assert.match(book, /<th scope="row">PAR<\/th>/)
  assert.match(book, /<th scope="row">SCORE<\/th>/)
  assert.match(book, /scorecardStyles\.parCell/)
  assert.match(book, /data-course-challenge-hole-index/)
  assert.match(styles, /width: 100%/)
  assert.match(styles, /min-width: 930px/)
  assert.match(styles, /width: 40px/)
  assert.match(styles, /height: 42px/)
})

test("welcome guide explains the purpose, progression, hints, and profile rewards", () => {
  const guide = read("components/course-challenges/CourseChallengesGuide.tsx")
  assert.match(guide, /WELCOME TO KRYS LEAGUES COURSE CHALLENGES/)
  assert.match(guide, /for every level of player/)
  assert.match(guide, /beginner or newer to a course/)
  assert.match(guide, /safe, consistent play/)
  assert.match(guide, /later Levels are designed to test/)
  assert.match(guide, /WHO(?:'|&apos;)S UP FOR THE CHALLENGE\?/)
  assert.match(guide, /NEED A LITTLE HELP\?/)
  assert.match(guide, /optional hints/)
  assert.match(guide, /SHOW OFF WHAT YOU EARN/)
  assert.match(guide, /Course Pro/)
  assert.match(guide, /Ace Challenge/)
  assert.match(guide, /Level 5/)
  assert.match(guide, /Course Master/)
})

test("profile display rewards are restricted and ordered without changing ownership", () => {
  const rewards = read("lib/courseChallenges/rewards.ts")
  const profile = read("lib/courseChallenges/profile.ts")
  const selector = read("components/course-challenges/CourseChallengeRewardSelector.tsx")
  const route = read("app/api/course-challenges/profile/selection/route.ts")
  assert.match(rewards, /isProfileDisplayRewardKey/)
  assert.match(profile, /profileRewards/)
  assert.match(selector, /profileRewards/)
  assert.match(selector, /Course Pro, Ace Challenge, Level 5, or Course Master/)
  assert.match(route, /isProfileDisplayRewardKey/)
  assert.match(selector, /<option value="">None<\/option>/)
})

test("reward visibility has earned, current ghost, and future silhouette states", () => {
  const book = read("components/course-challenges/CourseChallengeBook.tsx")
  const styles = read("components/course-challenges/course-challenges.module.css")
  assert.match(book, /data-reward-state=\{rewardState\}/)
  assert.match(book, /NEW PROFILE REWARD UNLOCKED!/)
  assert.match(styles, /\.rewardGhost/)
  assert.match(styles, /opacity\(\.24\)/)
  assert.match(book, /rewardSilhouette/)
  assert.doesNotMatch(book, /🔒/)
})
