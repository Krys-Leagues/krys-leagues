const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

export function normalizeLocalDateTimeInput(value: string) {
  const trimmed = value.trim()
  const match = trimmed.match(localDateTimePattern)
  if (!match) return null

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  const [, year, month, day, hour, minute, second = "00"] = match
  if (
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() + 1 !== Number(month) ||
    parsed.getDate() !== Number(day) ||
    parsed.getHours() !== Number(hour) ||
    parsed.getMinutes() !== Number(minute) ||
    parsed.getSeconds() !== Number(second)
  ) return null
  return parsed.toISOString()
}
