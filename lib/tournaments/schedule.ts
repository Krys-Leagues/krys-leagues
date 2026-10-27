const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

export type SchedulePreset = "NORMAL" | "ONE_DAY" | "CUSTOM"

export const SCHEDULE_PRESETS: Record<SchedulePreset, { label: string; defaultRoundDurationMinutes: number | null }> = {
  NORMAL: { label: "Normal bracket · 7 days per round", defaultRoundDurationMinutes: 7 * 24 * 60 },
  ONE_DAY: { label: "One-day bracket · 60 minutes per round", defaultRoundDurationMinutes: 60 },
  CUSTOM: { label: "Custom schedule", defaultRoundDurationMinutes: null },
}

export function assertIanaTimeZone(timeZone: string) {
  const value = timeZone.trim()
  if (!value || value.length > 80) throw new Error("A valid IANA time zone is required")
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format()
  } catch {
    throw new Error(`Invalid IANA time zone: ${value}`)
  }
  return value
}

function partsFor(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant)
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]))
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day), hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second) }
}

function sameWallClock(instant: Date, target: { year: number; month: number; day: number; hour: number; minute: number; second: number }, timeZone: string) {
  const actual = partsFor(instant, timeZone)
  return ["year", "month", "day", "hour", "minute", "second"].every((key) => actual[key as keyof typeof actual] === target[key as keyof typeof target])
}

/** Convert an admin-entered wall-clock value in the selected IANA zone to an unambiguous UTC instant. */
export function localDateTimeToUtc(localDateTime: string, timeZone: string) {
  assertIanaTimeZone(timeZone)
  const match = LOCAL_DATE_TIME.exec(localDateTime.trim())
  if (!match) throw new Error("Use a local date and time such as 2026-10-25T12:00")
  const target = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(match[4]), minute: Number(match[5]), second: Number(match[6] || 0) }
  const targetEpoch = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, target.second)
  let guess = targetEpoch
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const actual = partsFor(new Date(guess), timeZone)
    const representedEpoch = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second)
    guess = targetEpoch - (representedEpoch - guess)
  }
  const instant = new Date(guess)
  if (!sameWallClock(instant, target, timeZone)) throw new Error("That local time does not exist in the selected time zone because of a daylight-saving transition")
  const alternate = new Date(guess + 60 * 60 * 1000)
  if (sameWallClock(alternate, target, timeZone)) throw new Error("That local time is ambiguous in the selected time zone because of a daylight-saving transition")
  return instant.toISOString()
}

export function formatLocalDateTime(utcIso: string, timeZone: string) {
  assertIanaTimeZone(timeZone)
  const instant = new Date(utcIso)
  if (Number.isNaN(instant.getTime())) throw new Error("Invalid UTC instant")
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone }).format(instant)
}

export function roundScheduleDeadline(startUtcIso: string, durationMinutes: number) {
  const start = new Date(startUtcIso)
  if (Number.isNaN(start.getTime()) || !Number.isFinite(durationMinutes) || durationMinutes <= 0) throw new Error("A positive schedule duration and valid UTC start are required")
  return new Date(start.getTime() + durationMinutes * 60_000).toISOString()
}

