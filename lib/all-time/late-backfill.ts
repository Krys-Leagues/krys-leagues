export type BackfillPrecision = "exact" | "date_ordered"

export type BackfillAttempt = {
  id: string
  courseId: string
  playerId: string
  score: number
  authoritativeTimePrecision: BackfillPrecision
  authoritativeSubmittedAt?: string | null
  authoritativeSubmittedDate: string
  authoritativeSubmissionOrder?: number | null
}

export type BackfillEffect = {
  id: string
  classification: "FIRST" | "BETTER" | "EQUAL" | "WORSE"
  oldPbScore: number | null
  newPbScore: number | null
  passedPlayerIds: string[]
  points: number
  seasonId: string | null
}

function sortKey(entry: BackfillAttempt) {
  return [
    entry.authoritativeSubmittedDate,
    entry.authoritativeTimePrecision === "exact" ? 0 : 1,
    entry.authoritativeSubmittedAt ?? "",
    entry.authoritativeSubmissionOrder ?? Number.MAX_SAFE_INTEGER,
    entry.id,
  ] as const
}

function compare(a: BackfillAttempt, b: BackfillAttempt) {
  const left = sortKey(a), right = sortKey(b)
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] < right[index]) return -1
    if (left[index] > right[index]) return 1
  }
  return 0
}

export function hasDeterministicBackfillOrder(entries: BackfillAttempt[]) {
  const ordered = [...entries].sort(compare)
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1], current = ordered[index]
    if (previous.authoritativeSubmittedDate !== current.authoritativeSubmittedDate) continue
    if (previous.authoritativeTimePrecision !== current.authoritativeTimePrecision) return false
    if (previous.authoritativeTimePrecision === "exact" && previous.authoritativeSubmittedAt === current.authoritativeSubmittedAt && previous.authoritativeSubmissionOrder == null && current.authoritativeSubmissionOrder == null) return false
    if (previous.authoritativeTimePrecision === "date_ordered" && previous.authoritativeSubmissionOrder === current.authoritativeSubmissionOrder) return false
  }
  return true
}

export function replayLateBackfill(
  baseline: Array<{ courseId: string; playerId: string; score: number }>,
  entries: BackfillAttempt[],
  seasonId: string | null,
): BackfillEffect[] {
  if (!hasDeterministicBackfillOrder(entries)) throw new Error("Backfill chronology is not deterministic")
  const best = new Map<string, number>()
  for (const row of baseline) {
    const key = `${row.courseId}:${row.playerId}`
    best.set(key, Math.min(best.get(key) ?? Number.POSITIVE_INFINITY, row.score))
  }
  const effects: BackfillEffect[] = []
  for (const entry of [...entries].sort(compare)) {
    const key = `${entry.courseId}:${entry.playerId}`, oldPbScore = best.get(key) ?? null
    const classification = oldPbScore === null ? "FIRST" : entry.score < oldPbScore ? "BETTER" : entry.score === oldPbScore ? "EQUAL" : "WORSE"
    const passedPlayerIds = classification === "BETTER"
      ? [...best.entries()]
        .filter(([candidate, score]) => candidate.startsWith(`${entry.courseId}:`) && candidate !== key && score > entry.score)
        .map(([candidate]) => candidate.slice(entry.courseId.length + 1))
        .sort()
      : []
    const points = passedPlayerIds.length
    effects.push({ id: entry.id, classification, oldPbScore, newPbScore: classification === "FIRST" || classification === "BETTER" ? entry.score : oldPbScore, passedPlayerIds, points: classification === "BETTER" ? points : 0, seasonId })
    if (classification === "FIRST" || classification === "BETTER") best.set(key, entry.score)
  }
  return effects
}

export function hasDuplicateBackfillIdentity(entries: Array<{ entryKey: string; fingerprint: string }>) {
  const keys = new Set<string>(), fingerprints = new Set<string>()
  for (const entry of entries) {
    if (keys.has(entry.entryKey) || fingerprints.has(entry.fingerprint.toLowerCase())) return true
    keys.add(entry.entryKey); fingerprints.add(entry.fingerprint.toLowerCase())
  }
  return false
}
