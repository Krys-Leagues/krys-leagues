import type { HistoricalMatchPreview } from "./adapters/matchAdapter"
import type { PlayerMatch } from "./matchPlayers"

export const HISTORICAL_MATCH_PARSER_VERSION = "historical-match-v2"

export type HistoricalMatchIdentityDecision = {
  canonicalPlayerId: string | null
  resolutionNote?: string
  selectionSource?: "auto" | "manual" | "unresolved"
}

export type HistoricalMatchIdentityDecisions = Record<string, HistoricalMatchIdentityDecision>

export type HistoricalMatchCommitPayload = {
  p_season_number: number
  p_historical_label: string
  p_historical_year: number | null
  p_evidence_level: "standings_only" | "aggregate_course"
  p_source_filename: string
  p_source_sha256: string
  p_preview_fingerprint: string
  p_parser_version: string
  p_validated_preview: Record<string, unknown>
}

export function historicalMatchStandingKey(divisionNumber: number, finalRank: number) {
  return `${divisionNumber}:${finalRank}`
}

export function historicalMatchAutoLinkDecision(match?: PlayerMatch) {
  if (!match?.playerId || !match.autoLinkEligible || match.confidence !== 100 || !match.autoLinkReason) {
    return null
  }
  return {
    canonicalPlayerId: match.playerId,
    resolutionNote: `Auto-linked from ${match.autoLinkReason}.`,
    selectionSource: "auto" as const,
  }
}

export function historicalMatchIdentityReviewSummary(
  preview: HistoricalMatchPreview,
  candidates: Map<string, PlayerMatch>,
  decisions: HistoricalMatchIdentityDecisions
) {
  let autoLinked = 0
  let manuallyApproved = 0
  let unresolved = 0
  let needsReview = 0

  for (const division of preview.divisions) {
    for (const standing of division.standings) {
      const key = historicalMatchStandingKey(division.divisionNumber, standing.finalRank)
      const explicitDecision = decisions[key]
      if (explicitDecision) {
        if (explicitDecision.canonicalPlayerId) manuallyApproved += 1
        else unresolved += 1
      } else if (historicalMatchAutoLinkDecision(candidates.get(standing.historicalDisplayName))) {
        autoLinked += 1
      } else {
        needsReview += 1
      }
    }
  }

  return { autoLinked, manuallyApproved, unresolved, needsReview }
}

export function historicalMatchEffectiveIdentityDecisions(
  preview: HistoricalMatchPreview,
  candidates: Map<string, PlayerMatch>,
  decisions: HistoricalMatchIdentityDecisions
) {
  const effective: HistoricalMatchIdentityDecisions = {}
  for (const division of preview.divisions) {
    for (const standing of division.standings) {
      const key = historicalMatchStandingKey(division.divisionNumber, standing.finalRank)
      const autoDecision = historicalMatchAutoLinkDecision(candidates.get(standing.historicalDisplayName))
      if (autoDecision) effective[key] = autoDecision
    }
  }
  return { ...effective, ...decisions }
}

function canonicalHistoricalFacts(preview: HistoricalMatchPreview) {
  return {
    seasonNumber: preview.seasonNumber,
    historicalLabel: preview.historicalLabel,
    year: preview.year,
    evidenceLevel: preview.evidenceLevel,
    divisions: preview.divisions.map((division) => ({
      divisionNumber: division.divisionNumber,
      standings: division.standings.map((standing) => ({
        finalRank: standing.finalRank,
        historicalDisplayName: standing.historicalDisplayName,
        played: standing.played,
        wins: standing.wins,
        losses: standing.losses,
        draws: standing.draws,
        points: standing.points,
        holesWon: standing.holesWon,
        courses: standing.courses.map((course, index) => ({
          courseOrder: index + 1,
          courseName: course.courseName,
          played: course.played,
          outcome: course.outcome,
          holesWon: course.holesWon,
        })),
      })),
    })),
    audit: {
      realPlayerRows: preview.audit.realPlayerRows,
      courseAppearancesPlayed: preview.audit.courseAppearancesPlayed,
      courseAppearancesUnplayed: preview.audit.courseAppearancesUnplayed,
      authoritativeFixtures: preview.audit.authoritativeFixtures,
    },
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`
  }
  return JSON.stringify(value)
}

async function sha256Hex(bytes: ArrayBuffer | Uint8Array) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const stableBytes = new Uint8Array(source.byteLength)
  stableBytes.set(source)
  const digest = await globalThis.crypto.subtle.digest("SHA-256", stableBytes.buffer)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function sourceSha256(bytes: ArrayBuffer | Uint8Array) {
  return sha256Hex(bytes)
}

export function previewFingerprint(preview: HistoricalMatchPreview) {
  return sha256Hex(new TextEncoder().encode(stableStringify(canonicalHistoricalFacts(preview))))
}

export function historicalMatchCommitBlockers(preview: HistoricalMatchPreview) {
  const blockers: string[] = []
  if (preview.seasonNumber === null || preview.seasonNumber <= 0 || preview.audit.seasonsFound !== 1 || !preview.historicalLabel.trim()) {
    blockers.push("Invalid historical season metadata.")
  }
  if (preview.audit.realPlayerRows === 0 || preview.audit.populatedDivisions === 0) blockers.push("No historical standings were found.")
  if (preview.audit.conflicts > 0) blockers.push(`${preview.audit.conflicts} source conflict(s) must be corrected or reviewed in the source.`)
  if (preview.audit.malformedRows > 0) blockers.push(`${preview.audit.malformedRows} malformed historical player row(s) were found.`)
  if (preview.warnings.length > 0) blockers.push(...preview.warnings)
  return Array.from(new Set(blockers))
}

export function buildHistoricalMatchCommitPayload(
  preview: HistoricalMatchPreview,
  decisions: HistoricalMatchIdentityDecisions,
  sourceFilename: string,
  sourceHash: string,
  fingerprint: string,
  sourceReference = ""
): HistoricalMatchCommitPayload {
  if (preview.seasonNumber === null) throw new Error("Historical Match season number is required.")
  const facts = canonicalHistoricalFacts(preview)
  const divisions = preview.divisions.map((division) => ({
    divisionNumber: division.divisionNumber,
    standings: division.standings.map((standing) => {
      const decision = decisions[historicalMatchStandingKey(division.divisionNumber, standing.finalRank)]
      return {
        finalRank: standing.finalRank,
        historicalDisplayName: standing.historicalDisplayName,
        canonicalPlayerId: decision?.canonicalPlayerId ?? null,
        identityResolutionNote: decision?.canonicalPlayerId ? decision.resolutionNote ?? null : null,
        played: standing.played,
        wins: standing.wins,
        losses: standing.losses,
        draws: standing.draws,
        points: standing.points,
        holesWon: standing.holesWon,
        courses: standing.courses.map((course, index) => ({
          courseOrder: index + 1,
          courseName: course.courseName,
          played: course.played,
          outcome: course.outcome,
          holesWon: course.holesWon,
        })),
      }
    }),
  }))
  return {
    p_season_number: preview.seasonNumber,
    p_historical_label: preview.historicalLabel,
    p_historical_year: preview.year,
    p_evidence_level: preview.evidenceLevel,
    p_source_filename: sourceFilename,
    p_source_sha256: sourceHash,
    p_preview_fingerprint: fingerprint,
    p_parser_version: HISTORICAL_MATCH_PARSER_VERSION,
    p_validated_preview: { ...facts, entryMethod: sourceFilename.startsWith("manual-") ? "manual" : "csv", sourceReference: sourceReference || null, divisions },
  }
}
