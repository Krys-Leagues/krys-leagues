export function denseRanks(records: Array<{ score: number | null | undefined }>) {
  let rank = 0
  let previousScore: number | undefined

  return records.map((record) => {
    if (typeof record.score !== "number" || !Number.isFinite(record.score)) return null
    if (previousScore === undefined || record.score !== previousScore) rank += 1
    previousScore = record.score
    return rank
  })
}
