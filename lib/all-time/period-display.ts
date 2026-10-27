export type ClimbersPeriodForDisplay = {
  label?: string | null
  starts_at: string
  ends_at: string
}

const calendarDate = new Intl.DateTimeFormat("en-US", {
  month: "numeric",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})

export function formatClimbersPeriodLabel(period: ClimbersPeriodForDisplay) {
  if (period.label?.trim()) return period.label.trim()

  const start = new Date(period.starts_at)
  const end = new Date(period.ends_at)
  end.setUTCDate(end.getUTCDate() - 1)
  return `${calendarDate.format(start)}–${calendarDate.format(end)}`
}
