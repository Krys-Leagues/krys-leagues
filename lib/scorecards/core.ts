export const SCORECARD_HOLE_COUNT = 18
export const SCORECARD_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024

export const SCORECARD_ADAPTER_KEYS = [
  "stroke",
  "match",
  "pyp",
  "amateur_pro",
  "kwt",
  "doubles",
  "majors",
  "all_time",
] as const

export type ScorecardAdapterKey = (typeof SCORECARD_ADAPTER_KEYS)[number]
export type PlayedDateSource = "arranged_game" | "event_round" | "admin_selected"

export type ScorecardHoleInput = {
  holeNumber: number
  par: number
  strokes: number
}

export type ScorecardTotals = {
  frontNineStrokes: number
  backNineStrokes: number
  totalStrokes: number
  totalPar: number
  scoreToPar: number
}

export type PlayedDateAuthority = {
  arrangedGameDate?: string | null
  eventRoundDate?: string | null
  adminSelectedDate?: string | null
  rawCardDateText?: string | null
}

export type ResolvedPlayedDate = {
  playedDate: string
  source: PlayedDateSource
  rawCardDateText: string | null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function requireIsoDate(value: string, label: string) {
  if (!ISO_DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${label} must use YYYY-MM-DD.`)
  }
  return value
}

export function validateScorecardHoles(
  holes: ScorecardHoleInput[],
  authoritativePars?: readonly number[] | null,
) {
  if (holes.length !== SCORECARD_HOLE_COUNT) {
    throw new Error("A verified scorecard requires exactly 18 holes.")
  }
  if (authoritativePars && authoritativePars.length !== SCORECARD_HOLE_COUNT) {
    throw new Error("The authoritative course par set must contain exactly 18 holes.")
  }

  const sorted = holes.toSorted((left, right) => left.holeNumber - right.holeNumber)
  sorted.forEach((hole, index) => {
    const expectedHole = index + 1
    if (hole.holeNumber !== expectedHole) {
      throw new Error(`Hole ${expectedHole} is missing or duplicated.`)
    }
    if (!Number.isInteger(hole.par) || hole.par < 1 || hole.par > 20) {
      throw new Error(`Hole ${expectedHole} has an invalid par.`)
    }
    if (!Number.isInteger(hole.strokes) || hole.strokes < 1 || hole.strokes > 99) {
      throw new Error(`Hole ${expectedHole} has an invalid raw stroke count.`)
    }
    if (authoritativePars && hole.par !== authoritativePars[index]) {
      throw new Error(`Hole ${expectedHole} does not match the authoritative par set.`)
    }
  })
  return sorted
}

export function calculateScorecardTotals(
  holes: ScorecardHoleInput[],
  authoritativePars?: readonly number[] | null,
): ScorecardTotals {
  const sorted = validateScorecardHoles(holes, authoritativePars)
  const frontNineStrokes = sorted.slice(0, 9).reduce((sum, hole) => sum + hole.strokes, 0)
  const backNineStrokes = sorted.slice(9).reduce((sum, hole) => sum + hole.strokes, 0)
  const totalPar = sorted.reduce((sum, hole) => sum + hole.par, 0)
  const totalStrokes = frontNineStrokes + backNineStrokes
  return {
    frontNineStrokes,
    backNineStrokes,
    totalStrokes,
    totalPar,
    scoreToPar: totalStrokes - totalPar,
  }
}

export function resolvePlayedDate(authority: PlayedDateAuthority): ResolvedPlayedDate {
  const rawCardDateText = authority.rawCardDateText?.trim() || null
  if (authority.arrangedGameDate) {
    return {
      playedDate: requireIsoDate(authority.arrangedGameDate, "Arranged game date"),
      source: "arranged_game",
      rawCardDateText,
    }
  }
  if (authority.eventRoundDate) {
    return {
      playedDate: requireIsoDate(authority.eventRoundDate, "Event round date"),
      source: "event_round",
      rawCardDateText,
    }
  }
  if (authority.adminSelectedDate) {
    return {
      playedDate: requireIsoDate(authority.adminSelectedDate, "Played Date"),
      source: "admin_selected",
      rawCardDateText,
    }
  }
  throw new Error("Played Date needs an authoritative schedule, event round, or admin calendar selection.")
}

export function isSupportedScorecardEvidence(contentType: string, byteLength: number) {
  return ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(contentType.toLowerCase()) &&
    Number.isInteger(byteLength) &&
    byteLength > 0 &&
    byteLength <= SCORECARD_EVIDENCE_MAX_BYTES
}

export function safeScorecardEvidenceFilename(filename: string, contentType: string) {
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  }
  const extension = extensions[contentType.toLowerCase()]
  if (!extension) throw new Error("Unsupported scorecard image type.")
  const stem = filename
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "scorecard"
  return `${stem}.${extension}`
}
