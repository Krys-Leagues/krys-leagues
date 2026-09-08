export const KWT_RANK_ORDER = ["Amateur", "Semi-Pro", "Pro", "Elite"] as const
export const KWT_DIFFICULTY_ORDER = ["Easy", "Hard"] as const

export type KwtRank = (typeof KWT_RANK_ORDER)[number]
export type KwtDifficulty = (typeof KWT_DIFFICULTY_ORDER)[number]

export type KwtCourseRecordRow = {
  course_code: string
  course_name: string
  difficulty: KwtDifficulty
  historical_rank: KwtRank
  score: number
  player_id: string
  screen_name: string
}

export type KwtCourseRecord = {
  courseCode: string
  courseName: string
  records: Record<KwtDifficulty, Partial<Record<KwtRank, KwtCourseRecordEntry>>>
}

export type KwtCourseRecordEntry = {
  score: number
  holders: Array<{ playerId: string; screenName: string }>
}

export function buildKwtCourseRecords(rows: readonly KwtCourseRecordRow[]): KwtCourseRecord[] {
  const courses = new Map<string, KwtCourseRecord>()

  for (const row of rows) {
    if (!KWT_DIFFICULTY_ORDER.includes(row.difficulty) || !KWT_RANK_ORDER.includes(row.historical_rank) || !Number.isFinite(row.score)) continue
    const key = row.course_code.trim().toUpperCase()
    if (!key || !row.course_name.trim() || !row.player_id || !row.screen_name.trim()) continue
    const course = courses.get(key) ?? {
      courseCode: row.course_code,
      courseName: row.course_name,
      records: { Easy: {}, Hard: {} },
    }
    const current = course.records[row.difficulty][row.historical_rank]
    if (!current || row.score < current.score) {
      course.records[row.difficulty][row.historical_rank] = {
        score: row.score,
        holders: [{ playerId: row.player_id, screenName: row.screen_name }],
      }
    } else if (row.score === current.score && !current.holders.some((holder) => holder.playerId === row.player_id)) {
      current.holders.push({ playerId: row.player_id, screenName: row.screen_name })
    }
    courses.set(key, course)
  }

  return [...courses.values()]
    .map((course) => {
      for (const difficulty of KWT_DIFFICULTY_ORDER) {
        for (const rank of KWT_RANK_ORDER) {
          course.records[difficulty][rank]?.holders.sort((left, right) => left.screenName.localeCompare(right.screenName))
        }
      }
      return course
    })
    .sort((left, right) => left.courseName.localeCompare(right.courseName) || left.courseCode.localeCompare(right.courseCode))
}
