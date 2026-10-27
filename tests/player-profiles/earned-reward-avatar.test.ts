import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { isProfileDisplayRewardKey } from "../../lib/courseChallenges/rewards.ts"

const read = (path: string) => readFileSync(path, "utf8")

test("all persisted reward families are display-eligible when earned", () => {
  for (const rewardKey of [
    "course-challenge:tourist-trap:level-1:sticker",
    "course-challenge:tourist-trap:level-5:sticker",
    "course-challenge:tourist-trap:ace-wader",
    "course-challenge:tourist-trap:ace-legend",
    "course-challenge:tourist-trap:course-pro",
    "course-challenge:tourist-trap:course-master",
    "course-challenge:future-course:custom-badge",
  ]) assert.equal(isProfileDisplayRewardKey(rewardKey), true, rewardKey)
})

test("selection is owner- and earned-row-gated without changing reward ownership", () => {
  const route = read("app/api/course-challenges/profile/selection/route.ts")
  assert.match(route, /getCourseChallengeIdentity/)
  assert.match(route, /eq\("player_id", identity\.playerId\)/)
  assert.match(route, /eq\("reward_key", rewardKey\)/)
  assert.match(route, /That Course Challenge reward has not been earned by this player/)
  assert.match(route, /course_challenge_profile_selections/)
  assert.doesNotMatch(route, /from\("course_challenge_rewards"\)\.update|from\("course_challenge_rewards"\)\.delete/)
  assert.doesNotMatch(route, /Only Course Pro, Ace Track, Level 5, and Course Master/)
})

test("profile showcase uses the owner canonical reward set and keeps public viewers read-only", () => {
  const page = read("app/players/[id]/page.tsx")
  assert.match(page, /\.eq\("player_id", canonicalId\)/)
  assert.match(page, /fetch\(`\/api\/course-challenges\/profile\/\$\{encodeURIComponent\(canonicalId\)\}/)
  assert.match(page, /if \(!canEditProfile\) return/)
  assert.match(page, /body: JSON\.stringify\(\{ rewardKey \}\)/)
  assert.match(page, /setAvatarPath\(resolveEarnedProfileRewardAsset\(courseChallengeRewards, selected\) \|\| normalAvatarPath\)/)
  assert.match(page, /onSelectReward=\{\(rewardKey\) => void selectProfileReward\(rewardKey\)\}/)
})

test("normal avatar fallback remains available and local reward artwork is preserved", () => {
  const avatars = read("lib/playerAvatars.ts")
  const page = read("app/players/[id]/page.tsx")
  const route = read("app/api/course-challenges/profile/selection/route.ts")
  assert.ok(avatars.includes("if (/^(\\/|blob:|data:|https?:\\/\\/)/i.test(path))"))
  assert.match(page, /setNormalAvatarPath\(normalAvatar\)/)
  assert.match(route, /JSON\.stringify|selected_reward_key/) 
  assert.match(page, /setAvatarPath\(resolveEarnedProfileRewardAsset\(courseChallengeRewards, selected\) \|\| normalAvatarPath\)/)
})
