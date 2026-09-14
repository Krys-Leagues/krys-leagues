import assert from "node:assert/strict"
import test from "node:test"
import { groupProfileCourseChallengeRewards } from "../../lib/playerProfileCourseChallenges.ts"

const reward = (id: string, reward_key: string, course_slug: string, earned_at: string, label = reward_key) => ({
  id,
  reward_key,
  label,
  course_slug,
  level: null,
  earned_at,
})

test("profile showcase orders courses by each player's newest earned reward", () => {
  const groups = groupProfileCourseChallengeRewards([
    reward("tourist-1", "tourist-trap:level-1:sticker", "tourist-trap", "2026-09-11T10:00:00Z"),
    reward("cherry-1", "cherry-blossom:level-1:sticker", "cherry-blossom", "2026-09-12T10:00:00Z"),
  ])
  assert.deepEqual(groups.map((group) => group.course.slug), ["cherry-blossom", "tourist-trap"])
})

test("main progression and Ace Track rows sort highest to lowest", () => {
  const groups = groupProfileCourseChallengeRewards([
    reward("level-1", "tourist-trap:level-1:sticker", "tourist-trap", "2026-09-01T10:00:00Z"),
    reward("level-3", "tourist-trap:level-3:sticker", "tourist-trap", "2026-09-03T10:00:00Z"),
    reward("level-2", "tourist-trap:level-2:sticker", "tourist-trap", "2026-09-02T10:00:00Z"),
    reward("wader", "tourist-trap:ace-wader", "tourist-trap", "2026-09-04T10:00:00Z"),
    reward("chaser", "tourist-trap:ace-chaser", "tourist-trap", "2026-09-05T10:00:00Z"),
  ])[0]
  assert.deepEqual(groups.mainRewards.map((item) => item.reward_key), [
    "tourist-trap:level-3:sticker",
    "tourist-trap:level-2:sticker",
    "tourist-trap:level-1:sticker",
  ])
  assert.deepEqual(groups.aceRewards.map((item) => item.reward_key), [
    "tourist-trap:ace-chaser",
    "tourist-trap:ace-wader",
  ])
})

test("empty and per-player reward sets stay truthful", () => {
  assert.deepEqual(groupProfileCourseChallengeRewards([]), [])
  const groups = groupProfileCourseChallengeRewards([
    reward("tourist-1", "tourist-trap:level-1:sticker", "tourist-trap", "2026-09-11T10:00:00Z"),
  ])
  assert.equal(groups.length, 1)
  assert.equal(groups[0].course.slug, "tourist-trap")
})

test("profile UI expands the owner showcase and keeps the viewer navigation link at the bottom", async () => {
  const fs = await import("node:fs/promises")
  const page = await fs.readFile(new URL("../../app/players/[id]/page.tsx", import.meta.url), "utf8")
  assert.match(page, /openProfileSection === "course-challenges"/)
  assert.match(page, /\.eq\("player_id", canonicalId\)/)
  assert.match(page, /id="course-challenge-sticker-showcase"/)
  assert.match(page, /ACE TRACK[\s\S]*Take Me to Course Challenges/)
  assert.doesNotMatch(page, /CourseChallengeRewardSelector/)
})

test("showcase layout has explicit main and Ace rows with responsive large artwork", async () => {
  const fs = await import("node:fs/promises")
  const css = await fs.readFile(new URL("../../app/players/[id]/page.module.css", import.meta.url), "utf8")
  const page = await fs.readFile(new URL("../../app/players/[id]/page.tsx", import.meta.url), "utf8")
  assert.match(page, /MAIN \/ LEVEL \/ PRESTIGE/)
  assert.match(page, /ACE TRACK/)
  assert.match(css, /\.courseAchievementMedia[\s\S]*height: clamp\(260px/)
  assert.match(css, /\.courseAchievementGrid[\s\S]*repeat\(auto-fit/)
  assert.match(css, /@media[\s\S]*\.courseAchievementGrid[\s\S]*grid-template-columns: 1fr/)
})
