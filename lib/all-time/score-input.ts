export function sanitizeHoleScoreInput(value: string) {
  return value.replace(/[^0-9]/g, "")
}

export function parsePositiveHoleScore(value: string) {
  const trimmed = value.trim()
  return /^\d+$/.test(trimmed) && Number(trimmed) > 0 ? Number(trimmed) : null
}

export function nextHoleAfterCompleteInput(value: string, index: number, totalHoles = 18) {
  if (parsePositiveHoleScore(value) === null) return null
  return index + 1 < totalHoles ? index + 1 : null
}
