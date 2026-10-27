/**
 * Historical ordering evidence is deliberately separate from playedAt.
 *
 * An import timestamp is never accepted as a play timestamp.  Callers must
 * provide an explicit evidence kind when a real source timestamp exists.
 */
export type HistoricalTimeEvidenceKind =
  | "EXACT_TIMESTAMP"
  | "OFFICIAL_KWT_SEQUENCE"
  | "WEEK_WINDOW"
  | "ORDERED_UNDATED"
  | "UNKNOWN"

export type HistoricalTimeEvidence = {
  sourceId: string
  seasonNumber?: number | null
  weekNumber?: number | null
  playedAt?: string | null
  evidenceKind: HistoricalTimeEvidenceKind
  difficulty?: "EASY" | "HARD"
  evidenceRef?: string | null
  sourceSequence?: number | null
}

export type HistoricalOrdering = {
  evidenceKind: HistoricalTimeEvidenceKind
  chronological: boolean
  orderingKey: string
}

export type ChronologyConfidence =
  | "EXACT"
  | "OFFICIAL_KWT_SEQUENCE"
  | "PERIOD_WINDOW"
  | "ORDERED_UNDATED"
  | "UNKNOWN"
  | "AMBIGUOUS"

export type LatestTenReview = {
  confidence: ChronologyConfidence
  selected: readonly HistoricalTimeEvidence[]
  boundarySourceIds: readonly string[]
  reason: string | null
}

function validTimestamp(value: string | null | undefined): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
}

function pad(value: number): string {
  return String(value).padStart(8, "0")
}

export function resolveHistoricalOrdering(evidence: HistoricalTimeEvidence): HistoricalOrdering {
  if (evidence.evidenceKind === "EXACT_TIMESTAMP" && validTimestamp(evidence.playedAt)) {
    return {
      evidenceKind: "EXACT_TIMESTAMP",
      chronological: true,
      orderingKey: `0:${new Date(evidence.playedAt as string).toISOString()}:${evidence.sourceId}`,
    }
  }

  if (evidence.evidenceKind === "OFFICIAL_KWT_SEQUENCE"
    && Number.isInteger(evidence.seasonNumber)
    && Number.isInteger(evidence.weekNumber)
    && (evidence.difficulty === "EASY" || evidence.difficulty === "HARD")) {
    const difficultyOrder = evidence.difficulty === "EASY" ? "0" : "1"
    return {
      evidenceKind: "OFFICIAL_KWT_SEQUENCE",
      chronological: true,
      orderingKey: `1:${pad(evidence.seasonNumber as number)}:${pad(evidence.weekNumber as number)}:${difficultyOrder}:${evidence.sourceId}`,
    }
  }

  if (evidence.evidenceKind === "WEEK_WINDOW"
    && Number.isInteger(evidence.seasonNumber)
    && Number.isInteger(evidence.weekNumber)) {
    return {
      evidenceKind: "WEEK_WINDOW",
      chronological: false,
      orderingKey: `1:${pad(evidence.seasonNumber as number)}:${pad(evidence.weekNumber as number)}:${evidence.sourceId}`,
    }
  }

  if (evidence.evidenceKind === "ORDERED_UNDATED" && Number.isInteger(evidence.sourceSequence)) {
    return {
      evidenceKind: "ORDERED_UNDATED",
      chronological: false,
      orderingKey: `2:${pad(evidence.sourceSequence as number)}:${evidence.sourceId}`,
    }
  }

  return {
    evidenceKind: "UNKNOWN",
    chronological: false,
    orderingKey: `3:${evidence.sourceId}`,
  }
}

export function sortHistoricalEvidence(
  evidence: readonly HistoricalTimeEvidence[],
): readonly HistoricalTimeEvidence[] {
  return evidence
    .map((item, index) => ({ item, index, ordering: resolveHistoricalOrdering(item) }))
    .sort((left, right) => left.ordering.orderingKey.localeCompare(right.ordering.orderingKey) || left.index - right.index)
    .map(({ item }) => item)
}

function periodKey(item: HistoricalTimeEvidence): string | null {
  if (!Number.isInteger(item.seasonNumber) || !Number.isInteger(item.weekNumber)) return null
  return `${item.seasonNumber}:${item.weekNumber}`
}

/**
 * Selects a deterministic latest window while refusing to call a tied
 * week-window boundary chronological. This is a review result, not a
 * publication decision.
 */
export function reviewLatestTen(
  evidence: readonly HistoricalTimeEvidence[],
  limit = 10,
): LatestTenReview {
  if (limit <= 0) throw new Error("latest-ten limit must be positive")
  const ordered = sortHistoricalEvidence(evidence)
  if (!ordered.length) return { confidence: "UNKNOWN", selected: [], boundarySourceIds: [], reason: "no chronology evidence" }

  const exactOnly = ordered.every((item) => resolveHistoricalOrdering(item).evidenceKind === "EXACT_TIMESTAMP")
  const officialSequenceOnly = ordered.every((item) => resolveHistoricalOrdering(item).evidenceKind === "OFFICIAL_KWT_SEQUENCE")
  const hasUnknown = ordered.some((item) => resolveHistoricalOrdering(item).evidenceKind === "UNKNOWN")
  const hasUndatedOrder = ordered.some((item) => {
    const kind = resolveHistoricalOrdering(item).evidenceKind
    return kind === "ORDERED_UNDATED"
  })
  if (hasUnknown) {
    return { confidence: "UNKNOWN", selected: ordered.slice(-limit), boundarySourceIds: [], reason: "one or more rounds have unknown chronology" }
  }
  if (hasUndatedOrder) {
    return { confidence: "ORDERED_UNDATED", selected: ordered.slice(-limit), boundarySourceIds: [], reason: "selection includes source order without a timestamp" }
  }

  const selected = ordered.slice(-limit)
  if (exactOnly) return { confidence: "EXACT", selected, boundarySourceIds: [], reason: null }
  if (officialSequenceOnly) {
    return {
      confidence: "OFFICIAL_KWT_SEQUENCE",
      selected,
      boundarySourceIds: [],
      reason: "official KWT season/week pair order; no exact play timestamp",
    }
  }

  const allByPeriod = new Map<string, HistoricalTimeEvidence[]>()
  const selectedByPeriod = new Map<string, HistoricalTimeEvidence[]>()
  for (const item of ordered) {
    const key = periodKey(item)
    if (!key) continue
    allByPeriod.set(key, [...(allByPeriod.get(key) ?? []), item])
  }
  for (const item of selected) {
    const key = periodKey(item)
    if (!key) continue
    selectedByPeriod.set(key, [...(selectedByPeriod.get(key) ?? []), item])
  }
  const partialPeriod = [...selectedByPeriod.entries()].find(([key, items]) => {
    const total = allByPeriod.get(key)?.length ?? items.length
    return items.length < total
  })
  const boundarySourceIds = partialPeriod?.[1].map((item) => item.sourceId) ?? []
  if (boundarySourceIds.length > 0 && ordered.length > limit) {
    return {
      confidence: "AMBIGUOUS",
      selected,
      boundarySourceIds,
      reason: "latest-ten boundary contains multiple rounds in the same week window",
    }
  }
  return { confidence: "PERIOD_WINDOW", selected, boundarySourceIds: [], reason: "season/week order is deterministic but not an exact play chronology" }
}
