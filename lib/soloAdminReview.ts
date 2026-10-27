export type SoloReviewStatus = "provisional" | "verified" | "rejected" | "superseded_for_score" | "superseded_for_hn1"

export type SoloReviewRow = { id: string; submitted_at: string; status: SoloReviewStatus; difficulty: "easy" | "hard"; affects_score: boolean; affects_hn1: boolean }

export function soloSubmissionDayKey(submittedAt: string) {
  const date = new Date(submittedAt)
  return Number.isNaN(date.getTime()) ? "unknown" : date.toISOString().slice(0, 10)
}

export function groupSoloSubmissionsByDay<T extends SoloReviewRow>(rows: T[]) {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const key = soloSubmissionDayKey(row.submitted_at)
    const group = groups.get(key) || []
    group.push(row)
    groups.set(key, group)
  }
  return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([day, submissions]) => ({
    day,
    submissions: [...submissions].sort((a, b) => a.submitted_at.localeCompare(b.submitted_at)),
    total: submissions.length,
    verified: submissions.filter((row) => row.status === "verified").length,
    needReview: submissions.filter((row) => row.status === "provisional" || row.status.startsWith("superseded_")).length,
  }))
}

export function soloTrackLabel(affectsScore: boolean, affectsHn1: boolean) {
  if (affectsScore && affectsHn1) return "BOTH"
  if (affectsScore) return "SCORE TRACK"
  if (affectsHn1) return "HN1 TRACK"
  return "NEITHER"
}
