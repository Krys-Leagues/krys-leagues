import type { KwtDivision } from "./kwtNetCompetition.ts"
import type { KwtNetInput } from "./kwtNetLeaderboard.ts"

/**
 * The Production operational table stores gross KWT results and source
 * provenance. It intentionally does not duplicate display names, slopes, or
 * Handicap values. This adapter is the single boundary between that schema
 * and the NET calculation.
 */
export type ProductionOperationalResult = {
  season_number: number | null
  week_number: number | null
  player_id: string | null
  division: string | null
  easy_course_code: string | null
  hard_course_code: string | null
  easy_score: number | null
  hard_score: number | null
  total_score: number | null
  overall_placement: number | null
  points: number | null
  status: string | null
  source_type: string | null
  source_reference: string | null
}

export type ProductionPlayer = { id: string; screen_name: string | null }
export type PublishedHandicap = {
  canonical_player_id: string
  resulting_index: number | string | null
  handicap_status: string | null
  effective_from?: string | null
  created_at?: string | null
}

export type ProductionCourse = {
  code: string
  base_map: string | null
  difficulty: string | null
  display_name: string | null
  active: boolean | null
}

export type VerifiedWeekSetup = {
  eventIdentifier: string
  season: number
  week: number
  courseName: string
  easyCourseCode: string
  hardCourseCode: string
  easySlope: number
  hardSlope: number
  freezeCutoff: string
}

export type KwtWeekSetupMetadata = Omit<VerifiedWeekSetup, "easySlope" | "hardSlope">

const divisions = new Set<KwtDivision | "PROVISIONAL">(["ELITE", "PRO", "SEMI-PRO", "AMATEUR", "PROVISIONAL"])

function finite(value: number | string | null | undefined) {
  const parsed = typeof value === "string" ? Number(value) : value
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null
}

function normalizeDivision(value: string | null | undefined): KwtDivision | "PROVISIONAL" | undefined {
  const normalized = value?.trim().toLocaleUpperCase()
  const candidate = normalized === "AMA" || normalized === "AMATEUR" ? "AMATEUR"
    : normalized === "SEMI" || normalized === "SEMI-PRO" || normalized === "SEMI PRO" ? "SEMI-PRO"
      : normalized === "PRO" ? "PRO"
        : normalized === "ELITE" ? "ELITE"
          : normalized === "PROVISIONAL" ? "PROVISIONAL"
            : undefined
  return candidate && divisions.has(candidate as KwtDivision | "PROVISIONAL") ? candidate as KwtDivision | "PROVISIONAL" : undefined
}

export function eventIdentifierFor(season: number, week: number) {
  return `KWTS${season}W${String(week).padStart(2, "0")}`
}

export function adaptProductionOperationalRows(
  rows: readonly ProductionOperationalResult[],
  players: readonly ProductionPlayer[],
  handicaps: readonly PublishedHandicap[],
  setup: VerifiedWeekSetup,
): { inputs: KwtNetInput[]; rejected: string[] } {
  const playerNames = new Map(players.map((player) => [player.id, player.screen_name?.trim() || null]))
  const published = new Map(handicaps.map((row) => [row.canonical_player_id, row]))
  const rejected: string[] = []
  const inputs: KwtNetInput[] = []
  const seenPlayers = new Set<string>()

  for (const row of rows) {
    if (row.season_number !== setup.season || row.week_number !== setup.week) continue
    if (row.player_id && seenPlayers.has(row.player_id)) {
      rejected.push(`${row.player_id}: duplicate logical Season/week scorecard.`)
      continue
    }
    const sourceType = row.source_type?.trim().toLocaleLowerCase()
    const resultStatus = row.status?.trim().toLocaleLowerCase()
    if (!sourceType || !["kwt", "existing_kwt_website"].includes(sourceType) || !resultStatus || !["verified", "final", "official"].includes(resultStatus)) {
      rejected.push(`${row.player_id ?? "unknown"}: source or result status is not verified KWT.`)
      continue
    }
    if (row.easy_course_code !== setup.easyCourseCode || row.hard_course_code !== setup.hardCourseCode) {
      rejected.push(`${row.player_id ?? "unknown"}: course codes do not match the verified Week Setup.`)
      continue
    }
    const screenName = row.player_id ? playerNames.get(row.player_id) : null
    const handicap = row.player_id ? published.get(row.player_id) : undefined
    const handicapIndex = finite(handicap?.resulting_index)
    const handicapStatus = handicap?.handicap_status === "OFFICIAL_ELIGIBLE" ? "OFFICIAL" : handicap?.handicap_status === "PROVISIONAL" ? "PROVISIONAL" : null
    if (!row.player_id || !screenName || handicapIndex === null || !handicapStatus) {
      rejected.push(`${row.player_id ?? "unknown"}: canonical player name or published Handicap is unavailable.`)
      continue
    }
    if (row.total_score !== null && row.easy_score !== null && row.hard_score !== null && row.total_score !== row.easy_score + row.hard_score) {
      rejected.push(`${row.player_id}: Easy + Hard does not equal Total Score.`)
      continue
    }
    if (row.easy_score === null && row.hard_score === null) {
      rejected.push(`${row.player_id}: no gross Easy or Hard score is present.`)
      continue
    }
    inputs.push({
      playerId: row.player_id,
      screenName,
      easyGross: row.easy_score,
      hardGross: row.hard_score,
      handicapIndex,
      handicapStatus,
      resultStatus: resultStatus === "final" || resultStatus === "official" ? "FINAL" : "VERIFIED",
      division: normalizeDivision(row.division),
    })
    seenPlayers.add(row.player_id)
  }

  return { inputs, rejected }
}

/** Select the last published snapshot effective at or before the immutable freeze cutoff. */
export function selectFrozenPublishedHandicaps(rows: readonly PublishedHandicap[], freezeCutoff: string) {
  const cutoff = Date.parse(freezeCutoff)
  if (!Number.isFinite(cutoff)) return []
  const selected = new Map<string, PublishedHandicap>()
  for (const row of rows) {
    const effective = row.effective_from ? Date.parse(`${row.effective_from}T23:59:59.999Z`) : NaN
    if (!Number.isFinite(effective) || effective > cutoff) continue
    const previous = selected.get(row.canonical_player_id)
    const previousCreated = previous?.created_at ? Date.parse(previous.created_at) : -Infinity
    const created = row.created_at ? Date.parse(row.created_at) : -Infinity
    const previousEffective = previous?.effective_from ? Date.parse(`${previous.effective_from}T23:59:59.999Z`) : -Infinity
    if (!previous || effective > previousEffective || created > previousCreated) selected.set(row.canonical_player_id, row)
  }
  return [...selected.values()]
}

export function validateVerifiedWeekSetup(setup: VerifiedWeekSetup | null | undefined) {
  if (!setup) return false
  return setup.eventIdentifier === eventIdentifierFor(setup.season, setup.week)
    && Boolean(setup.courseName.trim())
    && Boolean(setup.easyCourseCode.trim())
    && Boolean(setup.hardCourseCode.trim())
    && Number.isFinite(setup.easySlope) && setup.easySlope > 0
    && Number.isFinite(setup.hardSlope) && setup.hardSlope > 0
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(?:\.\d+)?Z$/.test(setup.freezeCutoff)
}

