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
  description: string | null
  stream_url: string | null
  stream_platform: string | null
  stream_label: string | null
  stream_scheduled_at: string | null
  stream_is_live: boolean
  created_at: string
  updated_at: string
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

