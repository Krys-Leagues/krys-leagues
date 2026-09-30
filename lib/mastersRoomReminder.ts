import { majorRoundDayLabel, type MajorDayChoice, type MajorPlayDay, type MajorRoomRosterMember } from "./majors.ts"

export const MASTERS_ROOM_REMINDER_STORAGE_KEY = "krys-leagues:masters-room-reminder-dismissals-v1"

export type MastersRoomReminderAssignment = {
  eventId: string
  entryId: string
  playDayId: string
  timeSlotId: string
  groupLabel: string
  startsAt: string
  officialPlayDate: string
  dayNumber: MajorPlayDay["day_number"]
  roundLabel: string
  roster: MajorRoomRosterMember[]
}

export type MastersRoomReminderDismissals = Record<string, string>

const MASTERS_ROOM_REMINDER_EXCLUDED_PATHS = [
  "/access-denied",
  "/testing-access",
] as const

const MASTERS_ROOM_REMINDER_EXCLUDED_PREFIXES = [
  "/admin",
  "/auth",
  "/api",
] as const

export function shouldRenderMastersRoomReminderOnPath(pathname: string | null) {
  if (!pathname) return false
  if (MASTERS_ROOM_REMINDER_EXCLUDED_PATHS.includes(pathname as (typeof MASTERS_ROOM_REMINDER_EXCLUDED_PATHS)[number])) return false
  return !MASTERS_ROOM_REMINDER_EXCLUDED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function buildPublishedMastersRoomAssignments(
  eventId: string,
  schedule: MajorDayChoice[],
  days: MajorPlayDay[],
): MastersRoomReminderAssignment[] {
  const daysById = new Map(days.map((day) => [day.id, day]))

  return schedule.flatMap((choice) => {
    const day = daysById.get(choice.play_day_id)
    const roster = choice.room_roster || []

    // The existing player schedule RPC exposes a group label and roster only
    // for published rooms. Keep a second defensive size check here so an old
    // or invalid solo room can never become a player-facing reminder.
    if (!day || !choice.group_label || !choice.starts_at || roster.length < 2 || roster.length > 4) return []

    return [{
      eventId,
      entryId: choice.entry_id,
      playDayId: choice.play_day_id,
      timeSlotId: choice.time_slot_id,
      groupLabel: choice.group_label,
      startsAt: choice.starts_at,
      officialPlayDate: day.play_date,
      dayNumber: day.day_number,
      roundLabel: majorRoundDayLabel(day.day_number),
      roster: [...roster],
    }]
  }).sort((left, right) => left.startsAt.localeCompare(right.startsAt))
}

export function selectCurrentMastersRoomAssignment(
  assignments: MastersRoomReminderAssignment[],
  now = Date.now(),
) {
  if (assignments.length === 0) return null
  const upcoming = assignments.find((assignment) => new Date(assignment.startsAt).getTime() >= now)
  return upcoming || assignments.at(-1) || null
}

export function mastersRoomReminderScope(assignment: MastersRoomReminderAssignment) {
  return [assignment.eventId, assignment.entryId, assignment.playDayId].join(":")
}

export function mastersRoomAssignmentFingerprint(assignment: MastersRoomReminderAssignment) {
  return JSON.stringify({
    playDayId: assignment.playDayId,
    timeSlotId: assignment.timeSlotId,
    groupLabel: assignment.groupLabel,
    startsAt: assignment.startsAt,
    officialPlayDate: assignment.officialPlayDate,
    dayNumber: assignment.dayNumber,
    rosterPlayerIds: assignment.roster.map((member) => member.player_id).sort(),
  })
}

export function shouldAutoOpenMastersRoomReminder(
  assignment: MastersRoomReminderAssignment,
  dismissals: MastersRoomReminderDismissals,
) {
  return dismissals[mastersRoomReminderScope(assignment)] !== mastersRoomAssignmentFingerprint(assignment)
}

export function dismissMastersRoomAssignment(
  assignment: MastersRoomReminderAssignment,
  dismissals: MastersRoomReminderDismissals,
) {
  return {
    ...dismissals,
    [mastersRoomReminderScope(assignment)]: mastersRoomAssignmentFingerprint(assignment),
  }
}

export function parseMastersRoomReminderDismissals(value: string | null): MastersRoomReminderDismissals {
  if (!value) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
  } catch {
    return {}
  }
}
