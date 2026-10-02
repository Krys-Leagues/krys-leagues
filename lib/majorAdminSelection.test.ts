import assert from "node:assert/strict"
import test from "node:test"
import type { MajorEvent } from "./majors.ts"
import {
  majorAdminRouteContext,
  majorAdminToolHref,
  majorAdminWorkspaceHref,
  selectMajorAdminEvent,
} from "./majorAdminSelection.ts"

function event(overrides: Partial<MajorEvent>): MajorEvent {
  return {
    id: "major-2-id",
    slug: "major-2",
    name: "Major 2",
    year: null,
    status: "draft",
    signup_open: false,
    starts_at: null,
    ends_at: null,
    is_public: false,
    is_test_event: false,
    test_event_listed: false,
    description: null,
    stream_url: null,
    stream_platform: null,
    stream_label: null,
    stream_scheduled_at: null,
    stream_is_live: false,
    scorecard_background_url: null,
    scorecard_accent_color: null,
    scorecard_text_color: null,
    signup_capacity: null,
    signup_hard_capacity: 60,
    initial_release_capacity: 55,
    public_signup_opens_at: null,
    priority_signup_enabled: false,
    priority_signup_opens_at: null,
    priority_source_event_id: null,
    minimum_public_spots_at_open: null,
    public_capacity_adjusted_at: null,
    later_release_used_at: null,
    later_release_spots: null,
    schedule_timezone: "America/New_York",
    schedule_lock_hours_before_first_slot: 24,
    signup_instructions: null,
    scheduling_instructions: null,
    qualifier_information: null,
    cut_information: null,
    weekend_information: null,
    room_rules: null,
    stream_information: null,
    weekend_status_published_at: null,
    secondary_trophy_display_name: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

const masters = event({
  id: "masters-id",
  slug: "masters",
  name: "THE MINI-GOLF MASTERS",
  status: "registration",
  is_public: true,
  starts_at: "2026-10-01T04:00:00.000Z",
  ends_at: "2026-10-05T02:00:00.000Z",
})
const major2 = event({})
const testEvent = event({ id: "test-id", slug: "test", name: "Test", status: "registration", is_test_event: true })

test("initially selects the one current active public Major", () => {
  assert.equal(selectMajorAdminEvent([major2, masters, testEvent], undefined, new Date("2026-10-02T12:00:00.000Z"))?.id, masters.id)
})

test("an explicit admin selection remains selected", () => {
  assert.equal(selectMajorAdminEvent([major2, masters, testEvent], major2.id)?.id, major2.id)
  assert.equal(selectMajorAdminEvent([major2, masters, testEvent], testEvent.id)?.id, testEvent.id)
})

test("a sole active public future Major becomes the default without hardcoding Masters", () => {
  const futureMajor = event({ id: "future-id", slug: "future-major", name: "Future Major", status: "scheduled", is_public: true })
  assert.equal(selectMajorAdminEvent([major2, futureMajor, testEvent])?.id, futureMajor.id)
})

test("falls back deterministically to the existing first record when there is no clear current Major", () => {
  assert.equal(selectMajorAdminEvent([major2, testEvent])?.id, major2.id)

  const anotherPublic = event({ id: "another-id", slug: "another", status: "scheduled", is_public: true })
  const futureMajor = event({ id: "future-id", slug: "future-major", status: "registration", is_public: true })
  assert.equal(selectMajorAdminEvent([major2, anotherPublic, futureMajor])?.id, major2.id)
})

test("event-aware workspace and tool links preserve the selected Major", () => {
  assert.equal(majorAdminWorkspaceHref(masters.id), "/admin/majors?event=masters-id")
  assert.equal(majorAdminToolHref("/admin/majors/scheduling", masters.id), "/admin/majors/scheduling?event=masters-id")
  assert.deepEqual(majorAdminRouteContext("?event=masters-id"), { eventId: masters.id, showAll: false })
  assert.deepEqual(majorAdminRouteContext("?view=all"), { eventId: undefined, showAll: true })
})
