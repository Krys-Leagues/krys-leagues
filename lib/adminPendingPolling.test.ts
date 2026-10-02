import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { ADMIN_PENDING_POLL_INTERVAL_MS, shouldPollAdminPendingAlerts } from "./adminPendingPolling.ts"

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
  assert.match(component, /window\.setTimeout\(\(\) => void refresh\(\), ADMIN_PENDING_POLL_INTERVAL_MS\)/)
  assert.doesNotMatch(component, /setInterval/)
  assert.match(component, /document\.addEventListener\("visibilitychange"/)
  assert.match(component, /document\.removeEventListener\("visibilitychange"/)
  assert.match(component, /controller\?\.abort\(\)/)
  assert.match(component, /response\.status === 401 \|\| response\.status === 403/)
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
