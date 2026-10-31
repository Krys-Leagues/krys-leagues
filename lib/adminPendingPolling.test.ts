import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { ADMIN_PENDING_MAX_BACKOFF_MS, ADMIN_PENDING_POLL_INTERVAL_MS, ADMIN_PENDING_REQUEST_TIMEOUT_MS, adminPendingPollDelayMs, shouldPollAdminPendingAlerts } from "./adminPendingPolling.ts"

test("signed-out and unauthorized viewers never enter the admin polling loop", () => {
  assert.equal(shouldPollAdminPendingAlerts({ hasSession: false, accessDenied: false, hiddenForStream: false, documentVisible: true }), false)
  assert.equal(shouldPollAdminPendingAlerts({ hasSession: true, accessDenied: true, hiddenForStream: false, documentVisible: true }), false)
})

test("authorized polling runs only on visible non-stream pages", () => {
  assert.equal(shouldPollAdminPendingAlerts({ hasSession: true, accessDenied: false, hiddenForStream: false, documentVisible: true }), true)
  assert.equal(shouldPollAdminPendingAlerts({ hasSession: true, accessDenied: false, hiddenForStream: false, documentVisible: false }), false)
  assert.equal(shouldPollAdminPendingAlerts({ hasSession: true, accessDenied: false, hiddenForStream: true, documentVisible: true }), false)
})

test("the retained admin poll is one minute and the component prevents overlap and cleans up", () => {
  assert.equal(ADMIN_PENDING_POLL_INTERVAL_MS, 60_000)
  const component = readFileSync(new URL("../components/admin/AdminPendingAlerts.tsx", import.meta.url), "utf8")
  assert.match(component, /if \(!active \|\| inFlight \|\| !canPoll\(\)\) return/)
  assert.match(component, /window\.setTimeout\(\(\) => void refresh\(\), adminPendingPollDelayMs\(consecutiveFailures\)\)/)
  assert.doesNotMatch(component, /setInterval/)
  assert.match(component, /document\.addEventListener\("visibilitychange"/)
  assert.match(component, /document\.removeEventListener\("visibilitychange"/)
  assert.match(component, /controller\?\.abort\(\)/)
  assert.match(component, /response\.status === 401 \|\| response\.status === 403/)
  assert.match(component, /ADMIN_PENDING_REQUEST_TIMEOUT_MS/)
  assert.match(component, /consecutiveFailures \+= 1/)
})

test("admin polling failures use bounded exponential backoff", () => {
  assert.equal(ADMIN_PENDING_REQUEST_TIMEOUT_MS, 15_000)
  assert.equal(adminPendingPollDelayMs(0), 60_000)
  assert.equal(adminPendingPollDelayMs(1), 120_000)
  assert.equal(adminPendingPollDelayMs(2), 240_000)
  assert.equal(adminPendingPollDelayMs(3), 480_000)
  assert.equal(adminPendingPollDelayMs(4), ADMIN_PENDING_MAX_BACKOFF_MS)
  assert.equal(adminPendingPollDelayMs(100), ADMIN_PENDING_MAX_BACKOFF_MS)
})

test("one global request preserves both red admin alerts", () => {
  const component = readFileSync(new URL("../components/admin/AdminPendingAlerts.tsx", import.meta.url), "utf8")
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8")
  assert.equal(component.match(/fetch\("\/api\/admin\/pending-summary"/g)?.length, 1)
  assert.match(component, /COURSE CHALLENGE REVIEWS WAITING/)
  assert.match(component, /MASTERS SCORES WAITING/)
  assert.equal(layout.match(/<AdminPendingAlerts \/>/g)?.length, 1)
  assert.doesNotMatch(layout, /CourseChallengePendingAlert|MastersVerificationPendingAlert/)
})

test("the combined summary route uses the narrow Masters RPC and limits Course Challenge rows", () => {
  const route = readFileSync(new URL("../app/api/admin/pending-summary/route.ts", import.meta.url), "utf8")
  assert.match(route, /authorizeSiteAdminMutation/)
  assert.match(route, /get_major_scorecard_verification_summary/)
  assert.doesNotMatch(route, /get_major_scorecard_verification_queue/)
  assert.match(route, /\.limit\(1\)/)
})

test("legacy summary URLs stay lightweight for tabs opened before deployment", () => {
  const masters = readFileSync(new URL("../app/api/admin/majors/verification-summary/route.ts", import.meta.url), "utf8")
  const courseChallenges = readFileSync(new URL("../app/api/admin/course-challenges/route.ts", import.meta.url), "utf8")
  const proxy = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8")
  const refresh = proxy.indexOf("await refreshSupabaseSession(request)")
  assert.match(masters, /legacyMastersVerificationSummary/)
  assert.doesNotMatch(masters, /authorizeSiteAdminMutation|get_major_scorecard_verification_/)
  assert.ok(courseChallenges.indexOf('params.get("summary") === "1"') < courseChallenges.indexOf("await requireCourseChallengeAdmin()"))
  assert.ok(proxy.indexOf('pathname === "/api/admin/course-challenges"') < refresh)
  assert.ok(proxy.indexOf('pathname === "/api/admin/majors/verification-summary"') < refresh)
  assert.match(proxy, /LEGACY_ADMIN_POLL_HEADERS/)
})

test("the combined endpoint avoids duplicate proxy auth and the admin dashboard no longer polls a legacy URL", () => {
  const proxy = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8")
  const adminPage = readFileSync(new URL("../app/admin/page.tsx", import.meta.url), "utf8")
  assert.ok(proxy.indexOf('pathname === "/api/admin/pending-summary"') < proxy.indexOf("await refreshSupabaseSession(request)"))
  assert.match(adminPage, /fetch\("\/api\/admin\/pending-summary"/)
  assert.doesNotMatch(adminPage, /api\/admin\/course-challenges\?summary=1|setInterval/)
})
