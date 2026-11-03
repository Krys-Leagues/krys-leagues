export const ADMIN_HISTORY_STATUSES = ["pending", "needs_review", "approved", "rejected"] as const
export const ADMIN_HISTORY_STAGES = ["level", "ace", "prestige"] as const
export const ADMIN_COURSE_CHALLENGE_TIME_ZONE = "America/New_York"
export const RECENT_SUBMISSION_DAY_COUNT = 7

export type AdminHistoryStatus = (typeof ADMIN_HISTORY_STATUSES)[number]
export type AdminHistoryStage = (typeof ADMIN_HISTORY_STAGES)[number]

export type AdminHistoryFilters = {
  courseSlug: string
  difficulty: "all" | "Easy" | "Hard"
  status: "all" | AdminHistoryStatus
  stage: "all" | AdminHistoryStage
  from: string
  to: string
  page: number
  pageSize: number
}

function optionalChoice<T extends string>(value: string | null, choices: readonly T[], fallback: T): T {
  return value && choices.includes(value as T) ? value as T : fallback
}

export function normalizeAdminHistoryFilters(params: URLSearchParams): AdminHistoryFilters {
  const requestedPage = Number(params.get("page") || "1")
  const requestedPageSize = Number(params.get("pageSize") || "25")
  return {
    courseSlug: (params.get("courseSlug") || "").trim().slice(0, 120),
    difficulty: optionalChoice(params.get("difficulty"), ["all", "Easy", "Hard"] as const, "all"),
    status: optionalChoice(params.get("status"), ["all", ...ADMIN_HISTORY_STATUSES] as const, "all"),
    stage: optionalChoice(params.get("stage"), ["all", ...ADMIN_HISTORY_STAGES] as const, "all"),
    from: (params.get("from") || "").trim().slice(0, 10),
    to: (params.get("to") || "").trim().slice(0, 10),
    page: Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10000) : 1,
    pageSize: Number.isInteger(requestedPageSize) && requestedPageSize > 0 ? Math.min(requestedPageSize, 50) : 25,
  }
}

export function historyStage(challengeKey: unknown): AdminHistoryStage {
  return challengeKey === "ace" || challengeKey === "prestige" ? challengeKey : "level"
}

export function historyStageLabel(challengeKey: unknown, level: unknown, aceStage: unknown, prestigeStage: unknown) {
  const stage = historyStage(challengeKey)
  if (stage === "ace") return `Ace ${Number(aceStage || level || 0) || "Track"}`
  if (stage === "prestige") return `Prestige ${Number(prestigeStage || level || 0) || "Stage"}`
  return `Level ${Number(level || 0) || "—"}`
}

function dateKeyInTimeZone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value)
  const get = (type: string) => parts.find((part) => part.type === type)?.value || ""
  return `${get("year")}-${get("month")}-${get("day")}`
}

function addCalendarDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function zonedMidnight(dateKey: string, timeZone: string) {
  const candidate = new Date(`${dateKey}T00:00:00.000Z`)
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(candidate)
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0)
  const asZoneWallClock = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"))
  const offset = asZoneWallClock - candidate.getTime()
  return new Date(candidate.getTime() - offset)
}

export function recentSubmissionWindow(now = new Date(), dayOffset = 0, timeZone = ADMIN_COURSE_CHALLENGE_TIME_ZONE) {
  const boundedOffset = Number.isInteger(dayOffset) ? Math.min(Math.max(dayOffset, 0), RECENT_SUBMISSION_DAY_COUNT - 1) : 0
  const todayKey = dateKeyInTimeZone(now, timeZone)
  const dateKey = addCalendarDays(todayKey, -boundedOffset)
  const nextDateKey = addCalendarDays(dateKey, 1)
  const start = zonedMidnight(dateKey, timeZone)
  const end = zonedMidnight(nextDateKey, timeZone)
  return {
    timeZone,
    dayOffset: boundedOffset,
    dateKey,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    dateLabel: new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "full" }).format(start),
    dayLabel: boundedOffset === 0 ? "TODAY" : boundedOffset === 1 ? "YESTERDAY" : `${boundedOffset} DAYS AGO`,
  }
}
