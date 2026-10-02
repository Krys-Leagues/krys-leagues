import assert from "node:assert/strict"
import test from "node:test"
import type { MajorEvent } from "./majors.ts"
import {
  majorAdminRouteContext,
  majorAdminSchedulingDayHref,
  majorAdminToolHref,
  majorAdminWorkspaceHref,
  selectActiveMajorPlayDay,
  selectMajorAdminEvent,
} from "./majorAdminSelection.ts"
import type { MajorPlayDay } from "./majors.ts"

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

function playDay(dayNumber: 1 | 2 | 3 | 4, playDate: string, overrides: Partial<MajorPlayDay> = {}): MajorPlayDay {
  return {
    id: `day-${dayNumber}`,
    major_event_id: masters.id,
    day_number: dayNumber,
    label: dayNumber === 4 ? "Final Round" : `Round ${dayNumber}`,
    play_date: playDate,
    choices_locked: false,
    selection_locks_at: null,
    ...overrides,
  }
}

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
  assert.equal(majorAdminSchedulingDayHref(masters.id, "day-2"), "/admin/majors/scheduling?event=masters-id&playDay=day-2")
  assert.deepEqual(majorAdminRouteContext("?event=masters-id&playDay=day-2"), { eventId: masters.id, playDayId: "day-2", showAll: false })
  assert.deepEqual(majorAdminRouteContext("?view=all"), { eventId: undefined, playDayId: undefined, showAll: true })
})

test("selects each unambiguous active play day using the event reference timezone", () => {
  const days = [
    playDay(1, "2026-10-01"),
    playDay(2, "2026-10-02"),
    playDay(3, "2026-10-03"),
    playDay(4, "2026-10-04"),
  ]
  assert.equal(selectActiveMajorPlayDay(masters, days, new Date("2026-10-01T16:00:00.000Z"))?.day_number, 1)
  assert.equal(selectActiveMajorPlayDay(masters, days, new Date("2026-10-02T16:00:00.000Z"))?.day_number, 2)
  assert.equal(selectActiveMajorPlayDay(masters, days, new Date("2026-10-03T16:00:00.000Z"))?.day_number, 3)
  assert.equal(selectActiveMajorPlayDay(masters, days, new Date("2026-10-04T16:00:00.000Z"))?.day_number, 4)
})

test("event timezone controls the active day rather than the browser timezone", () => {
  const days = [playDay(1, "2026-10-01"), playDay(2, "2026-10-02")]
  assert.equal(selectActiveMajorPlayDay(masters, days, new Date("2026-10-02T02:00:00.000Z"))?.day_number, 1)
})

test("missing, malformed, foreign, or ambiguous play days fail safely", () => {
  const now = new Date("2026-10-02T16:00:00.000Z")
  assert.equal(selectActiveMajorPlayDay(masters, [], now), null)
  assert.equal(selectActiveMajorPlayDay(masters, [playDay(2, "not-a-date")], now), null)
  assert.equal(selectActiveMajorPlayDay(masters, [playDay(2, "2026-10-02", { major_event_id: major2.id })], now), null)
  assert.equal(selectActiveMajorPlayDay(masters, [playDay(2, "2026-10-02"), playDay(3, "2026-10-02")], now), null)
  assert.equal(selectActiveMajorPlayDay({ ...masters, schedule_timezone: "Invalid/Zone" }, [playDay(2, "2026-10-02")], now), null)
})
