export const KWT_RANK_ORDER = ["Amateur", "Semi-Pro", "Pro", "Elite"] as const
export const KWT_DIFFICULTY_ORDER = ["Easy", "Hard"] as const

export type KwtRank = (typeof KWT_RANK_ORDER)[number]
export type KwtDifficulty = (typeof KWT_DIFFICULTY_ORDER)[number]
export type KwtRecordScope = "overall" | "rank"

export type KwtCourseRecordRow = {
  course_code: string
  course_name: string
  difficulty: KwtDifficulty
  record_scope: KwtRecordScope
  historical_rank: KwtRank | null
  score: number
  player_id: string
  screen_name: string
}

export type KwtCourseRecord = {
  courseCode: string
  courseName: string
  records: Record<KwtDifficulty, {
    overall?: KwtCourseRecordEntry
    ranks: Partial<Record<KwtRank, KwtCourseRecordEntry>>
  }>
}

export type KwtCourseRecordEntry = {
  score: number
  holders: Array<{ playerId: string; screenName: string }>
}

export function buildKwtCourseRecords(rows: readonly KwtCourseRecordRow[]): KwtCourseRecord[] {
  const courses = new Map<string, KwtCourseRecord>()

  for (const row of rows) {
    if (!KWT_DIFFICULTY_ORDER.includes(row.difficulty) || !Number.isFinite(row.score)) continue
    if (row.record_scope !== "overall" && row.record_scope !== "rank") continue
    if (row.record_scope === "rank" && !KWT_RANK_ORDER.includes(row.historical_rank as KwtRank)) continue
    const key = row.course_code.trim().toUpperCase()
    if (!key || !row.course_name.trim() || !row.player_id || !row.screen_name.trim()) continue
    const course = courses.get(key) ?? {
      courseCode: row.course_code,
      courseName: row.course_name,
      records: { Easy: { ranks: {} }, Hard: { ranks: {} } },
    }
    const bucket = course.records[row.difficulty]
    const rank = row.historical_rank as KwtRank | null
    const current = row.record_scope === "overall"
      ? bucket.overall
      : bucket.ranks[rank as KwtRank]
    if (!current || row.score < current.score) {
      const next = {
        score: row.score,
        holders: [{ playerId: row.player_id, screenName: row.screen_name }],
      }
      if (row.record_scope === "overall") bucket.overall = next
      else bucket.ranks[rank as KwtRank] = next
    } else if (row.score === current.score && !current.holders.some((holder) => holder.playerId === row.player_id)) {
      current.holders.push({ playerId: row.player_id, screenName: row.screen_name })
    }
    courses.set(key, course)
  }

  return [...courses.values()]
    .map((course) => {
      for (const difficulty of KWT_DIFFICULTY_ORDER) {
        course.records[difficulty].overall?.holders.sort((left, right) => left.screenName.localeCompare(right.screenName))
        for (const rank of KWT_RANK_ORDER) {
          course.records[difficulty].ranks[rank]?.holders.sort((left, right) => left.screenName.localeCompare(right.screenName))
        }
      }
      return course
    })
    .sort((left, right) => left.courseName.localeCompare(right.courseName) || left.courseCode.localeCompare(right.courseCode))
}
