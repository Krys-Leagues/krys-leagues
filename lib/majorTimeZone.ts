export const DEFAULT_MAJOR_TIME_ZONE = "America/New_York"

export function isValidIanaTimeZone(value: string | null | undefined) {
  if (!value?.trim()) return false
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.trim() }).format()
    return true
  } catch {
    return false
  }
}

export function detectBrowserTimeZone() {
  if (typeof Intl === "undefined") return null
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
  return isValidIanaTimeZone(detected) ? detected : null
}

export function formatMajorLocalDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(new Date(value))
}

export function formatMajorLocalDateTime(value: string | null, timeZone: string) {
  if (!value) return "To be announced"
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value))
}

export function formatMajorLocalTimeWithZone(value: string, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(new Date(value))
}
