import type { MajorEvent } from "@/lib/majors"

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

export function majorAdminRouteContext(search: string) {
  const params = new URLSearchParams(search)
  return {
    eventId: params.get("event") || undefined,
    showAll: params.get("view") === "all",
  }
}

export function majorAdminWorkspaceHref(eventId: string) {
  return `/admin/majors?${new URLSearchParams({ event: eventId })}`
}

export function majorAdminToolHref(path: string, eventId: string) {
  return `${path}?${new URLSearchParams({ event: eventId })}`
}
