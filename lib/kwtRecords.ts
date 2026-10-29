import { isStrictKwtCombinedRow } from "./kwtCombinedPairing.ts"

export const KWT_RANK_ORDER = ["Amateur", "Semi-Pro", "Pro", "Elite"] as const
export const KWT_DIFFICULTY_ORDER = ["Easy", "Hard"] as const
export const KWT_RECORD_SECTION_ORDER = ["Easy", "Hard", "Combined"] as const
export function canonicalKwtBaseMap(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ").replace(/\s+(Easy|Hard)$/i, "")
  if (/^20(?:,?000)\b/i.test(normalized)) return "20,000 Leagues Under The Sea"
  return normalized
}

export function kwtCourseSearchValues(course: Pick<KwtCourseRecord, "courseName" | "courseCode" | "courseCodes">): string[] {
  return [...new Set([
    course.courseName,
    course.courseCode,
    ...course.courseCodes,
    ...course.courseCodes.map(code => code.replace(/[EH]$/i, "")),
  ])]
}

export function matchesKwtCourseQuery(course: Pick<KwtCourseRecord, "courseName" | "courseCode" | "courseCodes">, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  return !normalized || kwtCourseSearchValues(course).some(value => value.toLowerCase().includes(normalized))
}

export type KwtRank = (typeof KWT_RANK_ORDER)[number]
export type KwtDifficulty = (typeof KWT_DIFFICULTY_ORDER)[number]
export type KwtRecordSection = (typeof KWT_RECORD_SECTION_ORDER)[number]
export type KwtRecordScope = "overall" | "rank"

export type KwtCourseRecordRow = {
  course_code: string
  base_map?: string | null
  course_name: string
  difficulty: KwtRecordSection
  record_scope: KwtRecordScope
  historical_rank: KwtRank | null
  score: number
  player_id: string
  screen_name: string
  season_number?: number | null
  week_number?: number | null
  scorecard_id?: string | null
  event_key?: string | null
  easy_round_id?: string | null
  hard_round_id?: string | null
  pairing_evidence_type?: string | null
}

export type KwtCourseRecord = {
  courseCode: string
  courseName: string
  courseCodes: string[]
  records: Record<KwtRecordSection, {
    overall?: KwtCourseRecordEntry
    ranks: Partial<Record<KwtRank, KwtCourseRecordEntry>>
  }>
}

export type KwtCourseRecordEntry = {
  score: number
  holders: Array<{
    playerId: string
    screenName: string
    seasonNumber: number | null
    weekNumber: number | null
  }>
}

export function buildKwtCourseRecords(rows: readonly KwtCourseRecordRow[]): KwtCourseRecord[] {
  const courses = new Map<string, KwtCourseRecord>()

  for (const row of rows) {
    if (!KWT_RECORD_SECTION_ORDER.includes(row.difficulty) || !Number.isFinite(row.score) || !isStrictKwtCombinedRow(row)) continue
    if (row.record_scope !== "overall" && row.record_scope !== "rank") continue
    if (row.record_scope === "rank" && !KWT_RANK_ORDER.includes(row.historical_rank as KwtRank)) continue
    const baseMap = canonicalKwtBaseMap(row.base_map || row.course_name || row.course_code)
    const key = baseMap.toUpperCase()
    if (!key || !row.course_name.trim() || !row.player_id || !row.screen_name.trim()) continue
    const course = courses.get(key) ?? {
      courseCode: row.course_code,
      courseName: baseMap,
      courseCodes: [],
      records: { Easy: { ranks: {} }, Hard: { ranks: {} }, Combined: { ranks: {} } },
    }
    if (!course.courseCodes.includes(row.course_code)) course.courseCodes.push(row.course_code)
    const bucket = course.records[row.difficulty]
    const rank = row.historical_rank as KwtRank | null
    const current = row.record_scope === "overall" ? bucket.overall : bucket.ranks[rank as KwtRank]
    const holder = {
      playerId: row.player_id,
      screenName: row.screen_name,
      seasonNumber: row.season_number ?? null,
      weekNumber: row.week_number ?? null,
    }
    if (!current || row.score < current.score) {
      const next = { score: row.score, holders: [holder] }
      if (row.record_scope === "overall") bucket.overall = next
      else bucket.ranks[rank as KwtRank] = next
    } else if (row.score === current.score && !current.holders.some((existing) => holderKey(existing) === holderKey(holder))) {
      current.holders.push(holder)
    }
    courses.set(key, course)
  }

  return [...courses.values()]
    .map((course) => {
      for (const difficulty of KWT_RECORD_SECTION_ORDER) {
        course.records[difficulty].overall?.holders.sort(compareHolders)
        for (const rank of KWT_RANK_ORDER) course.records[difficulty].ranks[rank]?.holders.sort(compareHolders)
      }
      return course
    })
    .sort((left, right) => left.courseName.localeCompare(right.courseName) || left.courseCode.localeCompare(right.courseCode))
}

function holderKey(holder: KwtCourseRecordEntry["holders"][number]): string {
  return [holder.playerId, holder.seasonNumber ?? "", holder.weekNumber ?? ""].join("|")
}

function compareHolders(left: KwtCourseRecordEntry["holders"][number], right: KwtCourseRecordEntry["holders"][number]): number {
  return left.screenName.localeCompare(right.screenName) || (left.seasonNumber ?? 0) - (right.seasonNumber ?? 0) || (left.weekNumber ?? 0) - (right.weekNumber ?? 0)
}
