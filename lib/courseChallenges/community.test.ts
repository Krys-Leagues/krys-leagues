import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(new URL("../../" + path, import.meta.url), "utf8")

test("celebrations are positioned after approved welcome art and before released courses", () => {
  const source = read("components/course-challenges/CourseChallengesLanding.tsx")
  assert.ok(source.indexOf('src="/course-challenges/course-challenges-welcome-approved.png"') < source.indexOf("<CourseChallengeCelebrations"))
  assert.ok(source.indexOf("<CourseChallengeCelebrations") < source.indexOf("<section className={styles.courseList}"))
  assert.match(source, /course-challenges\/\$\{course\.slug\}\/community/)
})

test("celebration feed exposes seven days, fixed reactions, and public profile links", () => {
  const component = read("components/course-challenges/CourseChallengeCelebrations.tsx")
  const route = read("app/api/course-challenges/celebrations/route.ts")
  assert.match(component, /Array\.from\(\{ length: 7/)
  assert.match(component, /COURSE_CHALLENGE_REACTIONS/)
  assert.match(component, /players\/\$\{encodeURIComponent\(item\.playerId\)\}/)
  assert.match(route, /course_challenge_rewards/)
  assert.match(route, /earned_at/)
  assert.match(route, /current_user_canonical_player_id|getCourseChallengeIdentity/)
})

test("community route groups each player only at their highest completed level", () => {
  const route = read("app/api/course-challenges/community/route.ts")
  const page = read("components/course-challenges/CourseChallengeCommunity.tsx")
  assert.match(route, /Math\.max\(highest\.get\(row\.player_id\) \|\| 0, row\.level_number\)/)
  assert.match(route, /value === level/)
  assert.match(route, /getPublicCourseChallenges\(\)/)
  assert.match(route, /createCourseChallengesServiceClient\(\)/)
  assert.doesNotMatch(route, /createServerSupabaseClient\(\)/)
  assert.match(route, /course\.aceStages \|\| \[\]/)
  assert.doesNotMatch(route, /label: suffix === "course-pro" \? "Course Pro" : suffix === "ace-challenge"/)
  assert.match(page, /LEVEL \{group\.level\}/)
  assert.match(page, /ACE TRACK/)
  assert.match(page, /group\.kind === "ace"/)
  assert.match(page, /communityGrid/)
})

test("community player cards preserve artwork size and reflow for long names", () => {
  const styles = read("components/course-challenges/course-challenges.module.css")
  assert.match(styles, /\.communityGrid, \.specialGrid \{[^}]*minmax\(260px, 1fr\)/)
  assert.match(styles, /\.communityCard \{[^}]*grid-template-columns: 44px minmax\(0, 1fr\) 44px/)
  assert.match(styles, /\.communityCard \{[^}]*min-width: 0/)
  assert.match(styles, /\.communityPlayer \{[^}]*font-size: clamp\([^}]*\)/)
  assert.match(styles, /\.communityPlayer \{[^}]*overflow-wrap: anywhere/)
  assert.match(styles, /\.communityCard > img \{[^}]*width: 44px; height: 44px/)
  assert.match(styles, /@media \(max-width: 720px\) \{\s*\.communityGrid, \.specialGrid \{ grid-template-columns: minmax\(0, 1fr\); \}/)
})

test("profile achievements reuse the existing trophy case and omit private review fields", () => {
  const profile = read("app/players/[id]/page.tsx")
  assert.match(profile, /from\("course_challenge_rewards"\)/)
  assert.match(profile, /CourseChallengeTrophyGroups/)
  assert.match(profile, /Trophy Case/)
  assert.doesNotMatch(profile, /proof_photo_path|entered_scores|review_notes|admin_notes/)
})

test("Discord celebration support is optional and disabled until configured", () => {
  const helper = read("lib/courseChallenges/celebrations.ts")
  const sql = read("course_challenges_community.sql")
  assert.match(helper, /DISCORD_WEBHOOK_COURSE_CHALLENGE_CELEBRATIONS/)
  assert.match(helper, /buildCourseChallengeDiscordCelebration/)
  assert.doesNotMatch(helper, /fetch\(/)
  assert.match(sql, /course_challenge_reward_reactions/)
  assert.match(sql, /course_challenge_celebration_deliveries/)
  assert.match(sql, /primary key \(reward_id, player_id\)/i)
})
