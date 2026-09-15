const ISO_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/

function utcDateFromIso(value: string) {
  const match = ISO_DATE_PREFIX.exec(value)
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatClimbersPeriodRange(startsAt: string, endsAtExclusive: string) {
  const start = utcDateFromIso(startsAt)
  const endExclusive = utcDateFromIso(endsAtExclusive)
  if (!start || !endExclusive || endExclusive <= start) return "Unavailable period"

  const end = new Date(endExclusive.getTime() - 24 * 60 * 60 * 1000)
  const monthDay = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
  const year = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    timeZone: "UTC",
  })

  if (start.getUTCFullYear() === end.getUTCFullYear()) {
    return `${monthDay.format(start)}–${monthDay.format(end)}, ${year.format(end)}`
  }
  return `${monthDay.format(start)}, ${year.format(start)}–${monthDay.format(end)}, ${year.format(end)}`
}
