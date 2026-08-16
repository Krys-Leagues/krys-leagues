export type MajorEvent = {
  id: string
  slug: string
  name: string
  year: number | null
  status: "draft" | "registration" | "scheduled" | "live" | "complete" | "cancelled"
  signup_open: boolean
  starts_at: string | null
  ends_at: string | null
  is_public: boolean
  is_test_event: boolean
  test_event_listed: boolean
  description: string | null
  stream_url: string | null
  stream_platform: string | null
  stream_label: string | null
  stream_scheduled_at: string | null
  stream_is_live: boolean
  scorecard_background_url: string | null
  scorecard_accent_color: string | null
  scorecard_text_color: string | null
  signup_capacity: number | null
  signup_hard_capacity: number
  initial_release_capacity: number
  public_signup_opens_at: string | null
  priority_signup_enabled: boolean
  priority_signup_opens_at: string | null
  priority_source_event_id: string | null
  minimum_public_spots_at_open: number | null
  public_capacity_adjusted_at: string | null
  later_release_used_at: string | null
  later_release_spots: number | null
  schedule_timezone: string
  schedule_lock_hours_before_first_slot: number
  signup_instructions: string | null
  scheduling_instructions: string | null
  qualifier_information: string | null
  cut_information: string | null
  weekend_information: string | null
  room_rules: string | null
  stream_information: string | null
  weekend_status_published_at: string | null
  secondary_trophy_display_name: string | null
  created_at: string
  updated_at: string
}

export type MajorTestTester = {
  major_event_id: string
  player_id: string
  screen_name: string
  added_at: string
}

export type MajorSignupStatus = {
  spots_claimed: number
  capacity: number | null
  hard_capacity: number
  release_2_used: boolean
  signup_open: boolean
  public_signup_opens_at: string | null
  priority_signup_enabled: boolean
  state: "open" | "priority" | "full" | "upcoming" | "closed"
}

export type MajorScoringSession = {
  id: string
  major_event_id: string
  label: string
  participant_count: 2 | 3
  current_hole: number
  is_active: boolean
  is_public: boolean
  created_at: string
  updated_at: string
}

export type MajorScoringParticipant = {
  id: string
  session_id: string
  position: number
  player_id: string
  player_screen_name_snapshot: string
  created_at: string
}

export type MajorHoleScore = {
  id?: string
  session_id?: string
  participant_id: string
  hole_number: number
  strokes: number
}

export type PublicMajorScoreboard = {
  session: Omit<MajorScoringSession, "major_event_id" | "is_public" | "created_at">
  event: Pick<
    MajorEvent,
    | "id"
    | "slug"
    | "name"
    | "year"
    | "scorecard_background_url"
    | "scorecard_accent_color"
    | "scorecard_text_color"
  >
  participants: Array<Omit<MajorScoringParticipant, "session_id" | "created_at">>
  scores: MajorHoleScore[]
}

export function participantTotal(
  scores: MajorHoleScore[],
  participantId: string
) {
  return scores
    .filter((score) => score.participant_id === participantId)
    .reduce((total, score) => total + score.strokes, 0)
}

export type MajorEntry = {
  id: string
  major_event_id: string
  player_id: string
  player_screen_name_snapshot: string
  status: "registered" | "confirmed" | "waitlisted" | "withdrawn" | "declined"
  registered_at: string
  updated_at: string
}

export type MajorPlayDay = {
  id: string
  major_event_id: string
  day_number: 1 | 2 | 3 | 4
  label: string
  play_date: string
  choices_locked: boolean
  selection_locks_at: string | null
}

export type MajorTimeSlot = {
  id: string
  play_day_id: string
  starts_at: string
  label: string | null
  is_available: boolean
}

export type MajorDayChoice = {
  id: string
  entry_id: string
  play_day_id: string
  time_slot_id: string
  assignment_location: string | null
  starts_at?: string
  slot_label?: string | null
  selection_locks_at?: string | null
  is_locked?: boolean
  weekend_competition_status?: MajorWeekendStatus["competition_status"]
  group_label?: string | null
  group_competition?: MajorScheduleGroup["competition"] | null
  group_instructions?: string | null
  room_roster?: MajorRoomRosterMember[]
}

export type MajorRoomRosterMember = {
  player_id: string
  player_screen_name_snapshot: string
}

export type MajorWeekendStatus = {
  entry_id: string
  major_event_id: string
  competition_status: "pending" | "main" | "secondary"
  decided_at: string | null
  decided_by: string | null
}

export type MajorScheduleGroup = {
  id: string
  major_event_id: string
  play_day_id: string
  time_slot_id: string
  group_label: string
  competition: "qualifying" | "main" | "secondary"
  location: string | null
  instructions: string | null
  admin_notes: string | null
  is_finalized: boolean
  is_published: boolean
}

export type MajorScheduleGroupMember = {
  group_id: string
  major_event_id: string
  play_day_id: string
  time_slot_id: string
  entry_id: string
}

export type MajorFinalPlacement = {
  id: string
  major_event_id: string
  entry_id: string
  player_id: string
  player_screen_name_snapshot: string
  weekend_field: "main" | "secondary" | null
  field_placement: number | null
  is_tied: boolean
  is_winner: boolean
  result_status: "pending" | "completed" | "did_not_finish" | "withdrawn" | "disqualified"
  is_finalized: boolean
  finalized_at: string | null
  finalized_by: string | null
  created_at: string
  updated_at: string
}

export function isMajorDayLocked(day: Pick<MajorPlayDay, "choices_locked" | "selection_locks_at">) {
  return day.choices_locked || Boolean(day.selection_locks_at && Date.now() >= new Date(day.selection_locks_at).getTime())
}

export function formatMajorSlot(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value))
}

export function formatMajorLocalTime(value: string, timeZone?: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(new Date(value))
}

export function formatMajorDeadline(value: string, timeZone?: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value))
}

export const MAJOR_EVENT_STATUSES: MajorEvent["status"][] = [
  "draft",
  "registration",
  "scheduled",
  "live",
  "complete",
  "cancelled",
]

export const MAJOR_ENTRY_STATUSES: MajorEntry["status"][] = [
  "registered",
  "confirmed",
  "waitlisted",
  "withdrawn",
  "declined",
]

export const MASTERS_SCORECARD_THEME = {
  backgroundUrl: "/major-scorecards/masters/masters-large-scorecard.webp",
  accentColor: "#e8689a",
  textColor: "#f7e8ee",
} as const

export function isMastersScorecardTheme(event: {
  slug: string
  name: string
  scorecard_background_url: string | null
}) {
  const slug = event.slug.trim().toLowerCase()
  const name = event.name.trim().toLowerCase()
  const background = event.scorecard_background_url?.toLowerCase() || ""

  return (
    background === MASTERS_SCORECARD_THEME.backgroundUrl ||
    background.includes("/major-scorecards/masters/") ||
    slug === "masters" ||
    slug === "major-1" ||
    name === "masters" ||
    name === "major 1" ||
    name.startsWith("masters ") ||
    name.endsWith(" masters")
  )
}

export function formatMajorDate(value: string | null) {
  if (!value) return "To be announced"
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

export function toDateTimeLocal(value: string | null) {
  if (!value) return ""
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}
