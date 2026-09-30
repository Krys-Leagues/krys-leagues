export const PLAYER_LOCAL_TIME_HEADING = "AVAILABLE TIMES — SHOWN IN YOUR LOCAL TIME"

export const MASTERS_EVENT_TIME_ZONE = "America/New_York"

type DateTimeLocale = string | string[] | undefined

export type MastersPlayerSlotDisplay = {
  date: string
  time: string
  dayShift: "Previous day locally" | "Next day locally" | ""
}

export function meaningfulMajorSlotLabel(label: string | null | undefined) {
  const trimmed = label?.trim()
  return trimmed && !/^available$/i.test(trimmed) ? trimmed : null
}

function dateKey(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(value)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || ""
  return `${part("year")}-${part("month")}-${part("day")}`
}

function playerTimeLocale(timeZone: string, locale?: DateTimeLocale) {
  if (timeZone === "Europe/London") return "en-GB"
  if (timeZone.startsWith("America/")) return "en-US"
  return locale
}

function upperCaseDayPeriod(value: string) {
  return value.replace(/\b(am|pm)\b/giu, (dayPeriod) => dayPeriod.toUpperCase())
}

export function formatMastersPlayerTime(value: string, timeZone: string, locale?: DateTimeLocale) {
  const instant = new Date(value)
  const selectedLocale = playerTimeLocale(timeZone, locale)
  const time = new Intl.DateTimeFormat(selectedLocale, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(instant)
  const zone = new Intl.DateTimeFormat(selectedLocale, { timeZone, timeZoneName: "short" })
    .formatToParts(instant)
    .find((part) => part.type === "timeZoneName")?.value
  const visibleZone = zone && !/^(?:GMT|UTC)[+-]/iu.test(zone) ? ` ${zone}` : ""
  return upperCaseDayPeriod(`${time}${visibleZone}`)
}

export function formatMastersPlayerDate(value: string, timeZone: string, locale?: DateTimeLocale) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone,
  }).format(new Date(value))
}

export function formatMastersPlayerSlot(
  value: string,
  officialPlayDate: string,
  timeZone: string,
  locale?: DateTimeLocale,
): MastersPlayerSlotDisplay {
  const instant = new Date(value)
  const localDate = dateKey(instant, timeZone)
  return {
    date: formatMastersPlayerDate(value, timeZone, locale),
    time: formatMastersPlayerTime(value, timeZone, locale),
    dayShift: localDate < officialPlayDate
      ? "Previous day locally"
      : localDate > officialPlayDate
        ? "Next day locally"
        : "",
  }
}

export function formatMastersPlayerDateTime(value: string, timeZone: string, locale?: DateTimeLocale) {
  return `${formatMastersPlayerDate(value, timeZone, locale)} · ${formatMastersPlayerTime(value, timeZone, locale)}`
}

export function mastersAdminTimeZoneLabel(timeZone = MASTERS_EVENT_TIME_ZONE) {
  return timeZone === MASTERS_EVENT_TIME_ZONE ? "Eastern Time" : timeZone
}

export function formatMastersAdminTime(value: string, timeZone = MASTERS_EVENT_TIME_ZONE) {
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(new Date(value))
  if (timeZone === MASTERS_EVENT_TIME_ZONE) return `${time} ET`
  const zone = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
    .formatToParts(new Date(value))
    .find((part) => part.type === "timeZoneName")?.value
  return zone ? `${time} ${zone}` : time
}

export function formatMastersAdminDateTime(value: string, timeZone = MASTERS_EVENT_TIME_ZONE) {
  const date = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(new Date(value))
  return `${date} · ${formatMastersAdminTime(value, timeZone)}`
}

export function formatMastersOfficialDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`))
}
