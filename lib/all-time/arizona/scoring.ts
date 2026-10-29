import type {
  ArizonaPreviewRow,
  ArizonaSourceRecord,
  BestRecordSnapshot,
  IdentityPreview,
  PreviewCategory,
} from "./types.ts"

export function classifyBestScore(
  existingScore: number | null,
  incomingScore: number
): Exclude<PreviewCategory, "unresolved_identity" | "ambiguous_identity"> {
  if (existingScore === null) return "new_record"
  if (incomingScore < existingScore) return "better_score"
  if (incomingScore === existingScore) return "equal_unchanged"
  return "worse_score_ignored"
}

export function combinedScore(easyScore: number, hardScore: number) {
  return easyScore + hardScore
}

export function isOfficialCombinedSource(source: string) {
  return source === "KWT" || source === "PRO"
}

export function buildPreviewRows(
  records: ArizonaSourceRecord[],
  identities: Map<string, IdentityPreview>,
  existingBest: BestRecordSnapshot[]
): ArizonaPreviewRow[] {
  const bestByKey = new Map(
    existingBest.map((row) => [`${row.courseCode}:${row.playerId}`, row.score])
  )

  const preview: ArizonaPreviewRow[] = []
  const proposedBest = new Map(bestByKey)

  for (const record of records) {
    const identity = identities.get(record.historicalPlayerName) ?? {
      historicalPlayerName: record.historicalPlayerName,
      status: "unresolved" as const,
      playerId: null,
      canonicalScreenName: null,
      matchedSource: "unknown",
      confidence: 0,
      candidates: [],
    }

    if (identity.status !== "resolved" || !identity.playerId) {
      preview.push({
        ...record,
        identity,
        category:
          identity.status === "ambiguous"
            ? "ambiguous_identity"
            : "unresolved_identity",
        existingBestScore: null,
      })
      continue
    }

    const key = `${record.courseCode}:${identity.playerId}`
    const current = proposedBest.get(key) ?? null
    const category = classifyBestScore(current, record.score)

    preview.push({
      ...record,
      identity,
      category,
      existingBestScore: current,
    })

    if (category === "new_record" || category === "better_score") {
      proposedBest.set(key, record.score)
    }
  }

  return preview
}
