import test from "node:test"
import assert from "node:assert/strict"
import { isMajorCompleted, type MajorEvent } from "./majors.ts"

const event = (overrides: Partial<Pick<MajorEvent, "slug" | "status" | "signup_open" | "ends_at">> = {}) => ({
  slug: "masters",
  status: "registration" as const,
  signup_open: false,
  ends_at: "2026-10-04T22:00:00.000Z",
  ...overrides,
})

test("closed Masters after its end time is presented as completed", () => {
  assert.equal(isMajorCompleted(event(), Date.parse("2026-10-17T12:00:00.000Z")), true)
})

test("signup-open Masters remains an active registration event", () => {
  assert.equal(isMajorCompleted(event({ signup_open: true }), Date.parse("2026-10-17T12:00:00.000Z")), false)
})

test("draft future Majors are not presented as completed", () => {
  assert.equal(isMajorCompleted(event({ slug: "major-2", status: "draft", ends_at: null }), Date.parse("2026-10-17T12:00:00.000Z")), false)
})

test("an explicitly complete event is completed even without an end time", () => {
  assert.equal(isMajorCompleted(event({ status: "complete", ends_at: null }), Date.parse("2026-10-17T12:00:00.000Z")), true)
})
