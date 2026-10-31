import type { MajorEvent, MajorPlayDay } from "@/lib/majors"

const ACTIVE_MAJOR_STATUSES = new Set<MajorEvent["status"]>(["registration", "scheduled", "live"])

function isCurrentEventWindow(event: MajorEvent, now: Date) {
  if (!event.starts_at || !event.ends_at) return false
  const startsAt = new Date(event.starts_at).getTime()
  const endsAt = new Date(event.ends_at).getTime()
  const nowTime = now.getTime()
  return Number.isFinite(startsAt) && Number.isFinite(endsAt) && startsAt <= nowTime && nowTime <= endsAt
}

export function selectMajorAdminEvent(events: MajorEvent[], preferredId?: string, now = new Date()) {
  const preferred = preferredId ? events.find((event) => event.id === preferredId) : null
  if (preferred) return preferred

  const fallback = events[0] || null
  const activePublic = events.filter((event) =>
    event.is_public && !event.is_test_event && ACTIVE_MAJOR_STATUSES.has(event.status),
  )

  const currentByDate = activePublic.filter((event) => isCurrentEventWindow(event, now))
  if (currentByDate.length === 1) return currentByDate[0]

  const live = activePublic.filter((event) => event.status === "live")
  if (live.length === 1) return live[0]

  if (activePublic.length === 1) return activePublic[0]
  return fallback
}

function eventDateKey(now: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now)
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value
    const year = value("year")
    const month = value("month")
    const day = value("day")
    return year && month && day ? `${year}-${month}-${day}` : null
  } catch {
    return null
  }
}

export function selectActiveMajorPlayDay(event: MajorEvent, days: MajorPlayDay[], now = new Date()) {
  const currentDate = eventDateKey(now, event.schedule_timezone)
  if (!currentDate) return null
  const matches = days.filter((day) =>
    day.major_event_id === event.id
    && day.play_date === currentDate
    && Number.isInteger(day.day_number)
    && day.day_number >= 1
    && day.day_number <= 4,
  )
  return matches.length === 1 ? matches[0] : null
}

export function majorAdminRouteContext(search: string) {
  const params = new URLSearchParams(search)
  return {
    eventId: params.get("event") || undefined,
    playDayId: params.get("playDay") || undefined,
    showAll: params.get("view") === "all",
  }
}

export function majorAdminWorkspaceHref(eventId: string) {
  return `/admin/majors?${new URLSearchParams({ event: eventId })}`
}

export function majorAdminToolHref(path: string, eventId: string) {
  return `${path}?${new URLSearchParams({ event: eventId })}`
}

export function majorAdminSchedulingDayHref(eventId: string, playDayId: string) {
  return `/admin/majors/scheduling?${new URLSearchParams({ event: eventId, playDay: playDayId })}`
}
