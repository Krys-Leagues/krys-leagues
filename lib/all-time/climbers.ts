export type CourseKind = "individual" | "combined"
export type SubmissionSource = "current_submission" | "historical_import"
export type PbResult = "first" | "better" | "equal" | "worse"
export type BoardScore = { playerId: string; score: number; archived?: boolean; memorial?: boolean }
export type ClimbersSeason = { id: string; startsAt: string; endsAt: string }
export type ScoreSubmission = {
  id: string; playerId: string | null; courseId: string; courseKind: CourseKind; courseActive: boolean; score: number
  scorecardAt: string; submittedAt: string; source: SubmissionSource; serverMember: boolean; properGame: boolean
  witnessCompleted18: boolean; appliedAt?: string; correctedBySubmissionId?: string | null
  playerStatus?: "active" | "inactive" | "archived" | "memorial"
}
export type SubmissionEvaluation = {
  submissionId: string; playerId: string | null; eligible: boolean; rejectionReasons: string[]; pbResult: PbResult | null
  previousPb: number | null; newPb: number | null; seasonId: string | null; passedPlayerIds: string[]
  climbersPoints: number; createsClimbersEvent: boolean
}

function partsAt(instant: Date, timeZone: string) {
  const values = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(instant)
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(values.find((part) => part.type === type)?.value)
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") }
}

function wallTimeToInstant(parts: ReturnType<typeof partsAt>, timeZone: string) {
  let candidate = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const actual = partsAt(new Date(candidate), timeZone)
    const wantedWall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
    const actualWall = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second)
    const adjustment = wantedWall - actualWall
    if (adjustment === 0) break
    candidate += adjustment
  }
  return new Date(candidate)
}

export function calendarMonthCutoff(submittedAt: string, timeZone: string) {
  const submitted = new Date(submittedAt)
  if (Number.isNaN(submitted.getTime())) throw new Error("Discord submission timestamp is invalid.")
  const local = partsAt(submitted, timeZone)
  const previousMonthIndex = local.month - 2
  const targetYear = local.year + Math.floor(previousMonthIndex / 12)
  const targetMonthIndex = ((previousMonthIndex % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate()
  return wallTimeToInstant({ ...local, year: targetYear, month: targetMonthIndex + 1, day: Math.min(local.day, lastDay) }, timeZone).toISOString()
}

export function isWithinCalendarMonth(scorecardAt: string, submittedAt: string, timeZone: string) {
  const scorecard = new Date(scorecardAt), submitted = new Date(submittedAt)
  if (Number.isNaN(scorecard.getTime()) || Number.isNaN(submitted.getTime())) return false
  return scorecard <= submitted && scorecard >= new Date(calendarMonthCutoff(submittedAt, timeZone))
}

export function classifyPb(previousPb: number | null, submittedScore: number): PbResult {
  if (previousPb === null) return "first"
  if (submittedScore < previousPb) return "better"
  if (submittedScore === previousPb) return "equal"
  return "worse"
}

export function peoplePassed(playerId: string, previousPb: number, newPb: number, board: BoardScore[]) {
  if (newPb >= previousPb) return []
  return board.filter((opponent) => opponent.playerId !== playerId && previousPb >= opponent.score && newPb < opponent.score).map((opponent) => opponent.playerId).sort()
}

export function seasonForSubmission(submittedAt: string, seasons: ClimbersSeason[]) {
  const timestamp = new Date(submittedAt).getTime()
  const matches = seasons.filter((season) => timestamp >= new Date(season.startsAt).getTime() && timestamp < new Date(season.endsAt).getTime())
  if (matches.length > 1) throw new Error("Climbers seasons overlap.")
  return matches[0]?.id ?? null
}

export function evaluateSubmission(submission: ScoreSubmission, board: BoardScore[], seasons: ClimbersSeason[], timeZone: string): SubmissionEvaluation {
  const rejectionReasons: string[] = []
  if (!submission.playerId) rejectionReasons.push("Player could not be resolved.")
  if (!Number.isInteger(submission.score)) rejectionReasons.push("Score is invalid.")
  if (submission.source === "historical_import") {
    if (!submission.appliedAt || Number.isNaN(new Date(submission.appliedAt).getTime())) rejectionReasons.push("Historical baseline change requires its successful apply timestamp.")
  } else {
    if (submission.playerStatus && submission.playerStatus !== "active") rejectionReasons.push(submission.playerStatus === "memorial" ? "Memorial players cannot submit new current Records." : "Inactive or archived players cannot submit new current Records.")
    if (!submission.serverMember) rejectionReasons.push("Player is not a verified Krys server member.")
    if (!submission.courseActive) rejectionReasons.push("Course is not active for All-Time Records.")
    if (!submission.properGame) rejectionReasons.push("A proper named-room game was not confirmed.")
    if (!submission.witnessCompleted18) rejectionReasons.push("Another player did not complete all 18 holes.")
    if (!isWithinCalendarMonth(submission.scorecardAt, submission.submittedAt, timeZone)) rejectionReasons.push("Scorecard is older than the permitted calendar-month window.")
  }
  const eligible = rejectionReasons.length === 0
  const previousPb = submission.playerId ? board.find((row) => row.playerId === submission.playerId)?.score ?? null : null
  const pbResult = eligible ? classifyPb(previousPb, submission.score) : null
  const newPb = pbResult === "first" || pbResult === "better" ? submission.score : previousPb
  const seasonId = submission.source === "current_submission" ? seasonForSubmission(submission.submittedAt, seasons) : null
  const canClimb = eligible && submission.source === "current_submission" && submission.courseKind === "individual" && pbResult === "better" && previousPb !== null && seasonId !== null
  const passedPlayerIds = canClimb ? peoplePassed(submission.playerId!, previousPb, submission.score, board) : []
  return { submissionId: submission.id, playerId: submission.playerId, eligible, rejectionReasons, pbResult, previousPb, newPb, seasonId, passedPlayerIds, climbersPoints: passedPlayerIds.length, createsClimbersEvent: canClimb }
}

function replacePb(board: BoardScore[], playerId: string, score: number) { return [...board.filter((row) => row.playerId !== playerId), { playerId, score }] }

export function replaySubmissions(initialBoards: Map<string, BoardScore[]>, submissions: ScoreSubmission[], seasons: ClimbersSeason[], timeZone: string) {
  const boards = new Map([...initialBoards].map(([courseId, rows]) => [courseId, rows.map((row) => ({ ...row }))]))
  const reversed = new Set(submissions.map((submission) => submission.correctedBySubmissionId).filter((id): id is string => Boolean(id)))
  const effectiveAt = (submission: ScoreSubmission) => submission.source === "historical_import" ? submission.appliedAt ?? "" : submission.submittedAt
  const ordered = submissions.filter((submission) => !reversed.has(submission.id)).sort((left, right) => new Date(effectiveAt(left)).getTime() - new Date(effectiveAt(right)).getTime() || left.id.localeCompare(right.id))
  const evaluations: SubmissionEvaluation[] = []
  for (const submission of ordered) {
    const board = boards.get(submission.courseId) ?? []
    const evaluation = evaluateSubmission(submission, board, seasons, timeZone)
    evaluations.push(evaluation)
    if (evaluation.eligible && submission.playerId && (evaluation.pbResult === "first" || evaluation.pbResult === "better")) boards.set(submission.courseId, replacePb(board, submission.playerId, submission.score))
  }
  return { evaluations, boards }
}

export function climbersStandings(evaluations: SubmissionEvaluation[], seasonId: string) {
  const totals = new Map<string, number>()
  for (const evaluation of evaluations.filter((item) => item.seasonId === seasonId && item.createsClimbersEvent && item.playerId)) totals.set(evaluation.playerId!, (totals.get(evaluation.playerId!) ?? 0) + evaluation.climbersPoints)
  return [...totals].map(([playerId, points]) => ({ playerId, points })).sort((a, b) => b.points - a.points || a.playerId.localeCompare(b.playerId))
}

export function finalizedWinners(rows: Array<{ playerId: string; points: number }>) {
  if (rows.length === 0) return []
  const high = Math.max(...rows.map((row) => row.points))
  return rows.filter((row) => row.points === high).map((row) => row.playerId).sort()
}

export function yearToDatePoints(events: Array<{ playerId: string; points: number; submittedAt: string; finalized: boolean }>, year: number, timeZone: string) {
  const totals = new Map<string, number>()
  for (const event of events) if (event.finalized && partsAt(new Date(event.submittedAt), timeZone).year === year) totals.set(event.playerId, (totals.get(event.playerId) ?? 0) + event.points)
  return totals
}

export function activeLeaderboardAfterArchivedCleanup(board: BoardScore[]) {
  return board.filter((entry) => !entry.archived || entry.memorial === true)
}
