import { createHash } from "node:crypto"

import {
  HISTORICAL_PYP_PARSER_VERSION,
  historicalPypPreviewFingerprint,
  type HistoricalPypPreview,
  type HistoricalPypRow,
} from "./adapters/historicalPypParser.ts"

export type HistoricalPypIdentityReview = {
  historicalPlayerName: string
  status: "resolved" | "ambiguous" | "unresolved"
  canonicalPlayerId: string | null
  canonicalPlayerName?: string | null
}

export type HistoricalPypIdentityDecision = {
  historicalPlayerName: string
  canonicalPlayerId: string | null
  canonicalPlayerName: string | null
  selectionSource: "auto" | "manual" | "unresolved"
}

export type HistoricalPypPairingDecision = {
  reviewKey: string
  status: "confirmed"
  opponentHistoricalPlayerName: string
  opponentCanonicalPlayerId: string | null
}

type CommitIdentity = {
  canonicalPlayerId: string | null
  canonicalPlayerName: string | null
  selectionSource: "auto" | "manual" | "unresolved"
}

function hash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function identityFor(
  name: string,
  identityReviews: HistoricalPypIdentityReview[],
  identityDecisions: Record<string, HistoricalPypIdentityDecision>,
): CommitIdentity {
  const decision = identityDecisions[name]
  if (decision) return decision
  const review = identityReviews.find((item) => item.historicalPlayerName === name)
  if (review?.canonicalPlayerId) {
    return {
      canonicalPlayerId: review.canonicalPlayerId,
      canonicalPlayerName: review.canonicalPlayerName ?? null,
      selectionSource: "auto",
    }
  }
  return { canonicalPlayerId: null, canonicalPlayerName: null, selectionSource: "unresolved" }
}

export function historicalPypCommitBlockers(
  preview: HistoricalPypPreview,
  sourceShaMatches: boolean,
  identityReviews: HistoricalPypIdentityReview[],
  identityDecisions: Record<string, HistoricalPypIdentityDecision>,
  pairingDecisions: Record<string, HistoricalPypPairingDecision>,
) {
  const blockers: string[] = []
  if (!sourceShaMatches) blockers.push("The preserved PYP source SHA does not match the manifest.")
  if (preview.parserVersion !== HISTORICAL_PYP_PARSER_VERSION) blockers.push("The PYP parser version does not match the reviewed preview.")
  if (preview.rows.some((row) => preview.currentExcludedSeasons.includes(row.seasonNumber))) blockers.push("Current/excluded PYP seasons cannot be imported.")

  for (const name of new Set(preview.rows.map((row) => row.historicalPlayerName))) {
    if (!identityFor(name, identityReviews, identityDecisions).canonicalPlayerId) {
      blockers.push("Resolve the canonical Global Player for " + name + ".")
    }
  }

  for (const review of preview.pairingReviews) {
    const decision = pairingDecisions[review.reviewKey]
    if (!decision || decision.status !== "confirmed") blockers.push("Complete the actionable PYP pairing review for " + review.reviewKey + ".")
  }
  return blockers
}

function sourceRow(row: HistoricalPypRow, identity: CommitIdentity, pairingDecision?: HistoricalPypPairingDecision) {
  return {
    season: row.seasonNumber,
    division: row.division,
    game: row.gameNumber,
    historicalPlayerName: row.historicalPlayerName,
    canonicalPlayerId: identity.canonicalPlayerId,
    canonicalPlayerName: identity.canonicalPlayerName,
    selectionSource: identity.selectionSource,
    course1HolesWon: row.course1HolesWon,
    course2HolesWon: row.course2HolesWon,
    totalHolesWon: row.totalHolesWon,
    course1Raw: row.course1Raw,
    course2Raw: row.course2Raw,
    totalRaw: row.totalRaw,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    points: row.points,
    publishedPlacement: row.publishedPlacement,
    sourceEra: row.sourceEra,
    sourceState: row.sourceState,
    sourceStateEvidence: row.sourceStateEvidence,
    sourceSide: row.sourceSide,
    sourceWorkbook: row.sourceWorkbook,
    sourceTab: row.sourceTab,
    sourceRow: row.sourceRow,
    sourceCells: row.sourceCells,
    totalCell: row.totalCell,
    wldCells: row.wldCells,
    sourceUrl: row.sourceUrl,
    sourceRange: row.sourceRange,
    sourceFingerprint: row.sourceFingerprint,
    importable: row.importable,
    pairingState: row.pairingState,
    opponentHistoricalPlayerName: pairingDecision?.opponentHistoricalPlayerName ?? row.opponentHistoricalPlayerName,
    opponentCanonicalPlayerId: pairingDecision?.opponentCanonicalPlayerId ?? null,
    pairingEvidence: row.pairingEvidence,
    pairingSourceRange: row.pairingSourceRange,
    pairingSourceCells: row.pairingSourceCells,
    pairingSourceUrl: row.pairingSourceUrl,
  }
}

export function historicalPypCommitRows(
  preview: HistoricalPypPreview,
  identityReviews: HistoricalPypIdentityReview[],
  identityDecisions: Record<string, HistoricalPypIdentityDecision>,
  pairingDecisions: Record<string, HistoricalPypPairingDecision>,
) {
  return preview.rows.map((row) => {
    const reviewKey = preview.pairingReviews.find((review) => review.historicalPlayerName === row.historicalPlayerName
      && review.seasonNumber === row.seasonNumber
      && review.division === row.division
      && review.gameNumber === row.gameNumber)?.reviewKey
    return sourceRow(row, identityFor(row.historicalPlayerName, identityReviews, identityDecisions), reviewKey ? pairingDecisions[reviewKey] : undefined)
  })
}

export function historicalPypCommitFingerprint(
  preview: HistoricalPypPreview,
  identityReviews: HistoricalPypIdentityReview[],
  identityDecisions: Record<string, HistoricalPypIdentityDecision>,
  pairingDecisions: Record<string, HistoricalPypPairingDecision>,
) {
  return hash(JSON.stringify({
    preview: historicalPypPreviewFingerprint(preview),
    identities: Object.entries(identityDecisions).sort(),
    automaticIdentities: identityReviews.map((review) => [review.historicalPlayerName, review.canonicalPlayerId]).sort(),
    pairings: Object.entries(pairingDecisions).sort(),
  }))
}

export function buildHistoricalPypCommitPayload(
  preview: HistoricalPypPreview,
  sourceFilename: string,
  sourceSha256: string,
  previewFingerprint: string,
  identityReviews: HistoricalPypIdentityReview[],
  identityDecisions: Record<string, HistoricalPypIdentityDecision>,
  pairingDecisions: Record<string, HistoricalPypPairingDecision>,
) {
  return {
    p_source_filename: sourceFilename,
    p_source_sha256: sourceSha256,
    p_preview_fingerprint: previewFingerprint,
    p_parser_version: preview.parserVersion,
    p_validated_preview: {
      schemaVersion: "historical-pyp-v1",
      historicalSeasons: preview.historicalSeasons,
      currentExcludedSeasons: preview.currentExcludedSeasons,
      rows: historicalPypCommitRows(preview, identityReviews, identityDecisions, pairingDecisions),
      pairingDecisions,
      audit: preview.audit,
    },
  }
}
