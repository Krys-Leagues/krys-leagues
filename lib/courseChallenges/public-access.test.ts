import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { featureAccessDecision, matchesFeatureRoute } from "../featureVisibility/core.ts"
import { FEATURE_ROUTES } from "../featureVisibility/registry.ts"

const read = (path: string) => readFileSync(path, "utf8")

test("Course Challenges and its player-facing child routes are public to anonymous viewers", () => {
  const route = FEATURE_ROUTES.find((candidate) => candidate.path === "/course-challenges")

  assert.ok(route)
  assert.equal(route.visibility, "live")
  assert.equal(matchesFeatureRoute("/course-challenges", route.path), true)
  assert.equal(matchesFeatureRoute("/course-challenges/tourist-trap", route.path), true)
  assert.equal(matchesFeatureRoute("/course-challenges/tourist-trap/community", route.path), true)
  assert.equal(featureAccessDecision({ siteMode: "public", visibility: route.visibility, access: null }), "allow")
})

test("public viewing does not weaken Course Challenge mutation or admin authorization", () => {
  const celebrations = read("app/api/course-challenges/celebrations/route.ts")
  const submissions = read("app/api/course-challenges/submissions/route.ts")
  const rewardSelection = read("app/api/course-challenges/profile/selection/route.ts")
  const adminApi = read("app/api/admin/course-challenges/route.ts")
  const proxy = read("proxy.ts")

  assert.match(celebrations, /export async function GET[\s\S]*createCourseChallengesServiceClient\(\)/)
  assert.match(celebrations, /export async function POST[\s\S]*getCourseChallengeIdentity\(\)/)
  assert.match(celebrations, /export async function DELETE[\s\S]*getCourseChallengeIdentity\(\)/)
  assert.match(submissions, /getCourseChallengeIdentity\(\)/)
  assert.match(submissions, /canonical Krys Leagues player identity is required/)
  assert.match(rewardSelection, /getCourseChallengeIdentity\(\)/)
  assert.match(rewardSelection, /status: 401/)
  assert.match(adminApi, /requireCourseChallengeAdmin\(\)/)
  assert.ok(proxy.indexOf('pathname === "/admin"') < proxy.indexOf("getFeatureRoute(pathname)"))
})
