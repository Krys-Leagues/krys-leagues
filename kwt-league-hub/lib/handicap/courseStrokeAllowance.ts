/**
 * Display-safe KWT course-stroke calculations.
 *
 * The caller must supply a verified event/course slope. This module never
 * discovers, exposes, or invents private course-rating data.
 */
export const KWT_REFERENCE_SLOPE = 8.515

export type KwtStrokeDirection = "RECEIVED" | "GIVEN" | "ZERO"

export type CourseStrokeAllowance = {
  rawAllowance: number
  strokes: number
  direction: KwtStrokeDirection
  display: string
}

export type VerifiedKwtEvent = {
  eventIdentifier: string
  courseName: string
  easySlope: number
  hardSlope: number
}

export type KwtShotsDisplay = {
  eventIdentifier: string
  courseName: string
  easy: CourseStrokeAllowance
  hard: CourseStrokeAllowance
}

/** Round the magnitude so negative allowances follow the same .5-up rule. */
export function roundStrokeMagnitude(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.floor(Math.abs(value) + 0.5 + Number.EPSILON)
}

export function calculateCourseStrokeAllowance(
  storedIndex: number | null | undefined,
  courseSlope: number | null | undefined,
  referenceSlope = KWT_REFERENCE_SLOPE,
): CourseStrokeAllowance | null {
  if (
    storedIndex === null || storedIndex === undefined || !Number.isFinite(storedIndex)
    || courseSlope === null || courseSlope === undefined || !Number.isFinite(courseSlope) || courseSlope <= 0
    || !Number.isFinite(referenceSlope) || referenceSlope <= 0
  ) return null

  const rawAllowance = storedIndex * courseSlope / referenceSlope
  const strokes = roundStrokeMagnitude(rawAllowance)
  const direction: KwtStrokeDirection = rawAllowance < 0 ? "GIVEN" : rawAllowance > 0 ? "RECEIVED" : "ZERO"
  const label = direction === "ZERO" ? "ZERO STROKES" : `${strokes} ${direction}`
  return { rawAllowance, strokes, direction, display: label }
}

/**
 * Build only the fields that are safe for a player-facing KWT SHOTS card.
 * Missing schedule, index, or slope data fails closed.
 */
export function buildKwtShotsDisplay(
  event: VerifiedKwtEvent | null | undefined,
  storedIndex: number | null | undefined,
  referenceSlope = KWT_REFERENCE_SLOPE,
): KwtShotsDisplay | null {
  if (!event || !event.eventIdentifier.trim() || !event.courseName.trim()) return null
  const easy = calculateCourseStrokeAllowance(storedIndex, event.easySlope, referenceSlope)
  const hard = calculateCourseStrokeAllowance(storedIndex, event.hardSlope, referenceSlope)
  if (!easy || !hard) return null
  return {
    eventIdentifier: event.eventIdentifier,
    courseName: event.courseName,
    easy,
    hard,
  }
}
