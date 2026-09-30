import { MAJOR_COURSES, type MajorPlayerScoringRound, type MajorPublishedRoom } from "./majors.ts"

export const MASTERS_SCORE_PRESHOW_MS = 3 * 60 * 60 * 1000
export const MASTERS_SCORE_CLOSE_AFTER_LAST_ROOM_MS = 3 * 60 * 60 * 1000

export function mastersCourseForRound(dayNumber: number) {
  return dayNumber <= 2 ? MAJOR_COURSES.CBE : MAJOR_COURSES.CBH
}

export function mastersRoundAccessState(
  round: Pick<MajorPlayerScoringRound, "room_start_at" | "round_closes_at">,
  now: number,
): MajorPlayerScoringRound["score_access_state"] {
  if (!round.room_start_at || !round.round_closes_at) return "hidden"
  const startsAt = Date.parse(round.room_start_at)
  const closesAt = Date.parse(round.round_closes_at)
  if (!Number.isFinite(startsAt) || !Number.isFinite(closesAt)) return "hidden"
  if (now < startsAt - MASTERS_SCORE_PRESHOW_MS) return "hidden"
  if (now < startsAt) return "upcoming"
  return now <= closesAt ? "open" : "closed"
}

export function visibleMastersScoringRounds(rounds: readonly MajorPlayerScoringRound[], now: number) {
  return rounds.filter((round) => mastersRoundAccessState(round, now) !== "hidden")
}

export function nextMastersScoreAccessTransition(rounds: readonly MajorPlayerScoringRound[], now: number) {
  const transitions = rounds.flatMap((round) => {
    if (!round.room_start_at || !round.round_closes_at) return []
    const start = Date.parse(round.room_start_at)
    const close = Date.parse(round.round_closes_at)
    if (!Number.isFinite(start) || !Number.isFinite(close)) return []
    return [start - MASTERS_SCORE_PRESHOW_MS, start, close + 1]
  }).filter((transition) => transition > now)
  return transitions.length ? Math.min(...transitions) : null
}

export function isCompletePublishedMastersRoom(room: MajorPublishedRoom) {
  return room.roster.length >= 2 && room.roster.length <= 4
}

export function sortMastersPublishedRooms(rooms: readonly MajorPublishedRoom[]) {
  return rooms
    .filter(isCompletePublishedMastersRoom)
    .toSorted((left, right) => {
      const timeDifference = Date.parse(left.starts_at) - Date.parse(right.starts_at)
      return timeDifference || left.group_label.localeCompare(right.group_label, undefined, { numeric: true })
    })
}

export function mastersScoreTotal(values: readonly string[]) {
  return values.reduce((total, value) => {
    const score = Number(value)
    return Number.isFinite(score) && score > 0 ? total + score : total
  }, 0)
}

export function shouldAdvanceMastersHole(value: string, holeIndex: number) {
  return holeIndex < 17 && /^[1-9]$/.test(value)
}
