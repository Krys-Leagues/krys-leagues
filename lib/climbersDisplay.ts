export function readableClimbersLabel(value: string) {
  return value
    .replaceAll("â€“", "–")
    .replaceAll("â€”", "—")
    .replaceAll("Â", "")
}

function formatUtcDate(value: string, subtractDay = false) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown date"
  if (subtractDay) date.setUTCDate(date.getUTCDate() - 1)
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)
}

export function formatClimbersDateRange(startsAt: string, endsAt: string) {
  return `${formatUtcDate(startsAt)} – ${formatUtcDate(endsAt, true)}`
}

export function formatClimbersSeasonLabel(label: string, startsAt?: string, endsAt?: string) {
  const readable = readableClimbersLabel(label)
  return readable.includes("Unknown") || readable.trim() === "Climbers Season"
    ? startsAt && endsAt ? formatClimbersDateRange(startsAt, endsAt) : readable
    : readable
}
