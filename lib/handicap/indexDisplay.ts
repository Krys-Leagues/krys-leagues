/**
 * Formats the stored signed Handicap Index using golf notation.
 *
 * The stored number remains signed and is the only value used for sorting,
 * calculations, or future strokes-given logic. A negative stored index is
 * displayed with a plus sign because that is the conventional golf notation.
 */
export function formatGolfHandicapIndex(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—"

  const roundedMagnitude = Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100
  if (roundedMagnitude === 0) return "0.00"

  const magnitude = roundedMagnitude.toFixed(2)
  return value < 0 ? `+${magnitude}` : magnitude
}

/** Sorts stored signed indexes; null and non-finite values sort last. */
export function compareStoredHandicapIndexes(left: number | null, right: number | null): number {
  const leftValid = typeof left === "number" && Number.isFinite(left)
  const rightValid = typeof right === "number" && Number.isFinite(right)
  if (!leftValid && !rightValid) return 0
  if (!leftValid) return 1
  if (!rightValid) return -1
  return left - right
}
