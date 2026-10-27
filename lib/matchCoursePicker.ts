export const MATCH_GAME_DIFFICULTIES = ["Easy", "Hard", "Easy"] as const

export type MatchCourseDifficulty = (typeof MATCH_GAME_DIFFICULTIES)[number]

export type MatchCourseCandidate = {
  code: string
  baseMap: string
  difficulty: MatchCourseDifficulty
  displayName: string
  active: boolean
  releaseDate?: string | null
}

export type MatchCourseChoice = {
  code: string
  baseMap: string
  difficulty: MatchCourseDifficulty
  displayName: string
}

export function requiredMatchCourseDifficulty(gameNumber: number): MatchCourseDifficulty {
  if (!Number.isInteger(gameNumber) || gameNumber < 1 || gameNumber > MATCH_GAME_DIFFICULTIES.length) {
    throw new Error("Match game number must be 1, 2, or 3.")
  }

  return MATCH_GAME_DIFFICULTIES[gameNumber - 1]
}

export function normalizeMatchMapKey(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function isReleased(releaseDate: string | null | undefined, asOf: Date): boolean {
  if (!releaseDate) return true

  const timestamp = Date.parse(`${releaseDate}T00:00:00Z`)
  return Number.isFinite(timestamp) && timestamp <= asOf.getTime()
}

export function filterEligibleMatchCourses(
  candidates: MatchCourseCandidate[],
  requiredDifficulty: MatchCourseDifficulty,
  blockedBaseMaps: Iterable<string> = [],
  asOf = new Date(),
): MatchCourseCandidate[] {
  const blocked = new Set([...blockedBaseMaps].map(normalizeMatchMapKey))
  const byMap = new Map<string, MatchCourseCandidate>()

  for (const candidate of candidates) {
    const mapKey = normalizeMatchMapKey(candidate.baseMap)
    if (!candidate.active || candidate.difficulty !== requiredDifficulty || blocked.has(mapKey)) continue
    if (!isReleased(candidate.releaseDate, asOf) || byMap.has(mapKey)) continue
    byMap.set(mapKey, candidate)
  }

  return [...byMap.values()].sort((left, right) => left.displayName.localeCompare(right.displayName))
}

export function chooseDistinctMatchCourseOptions(
  candidates: MatchCourseCandidate[],
  requiredDifficulty: MatchCourseDifficulty,
  blockedBaseMaps: Iterable<string> = [],
  random: () => number = Math.random,
  count = 3,
): MatchCourseChoice[] {
  const eligible = filterEligibleMatchCourses(candidates, requiredDifficulty, blockedBaseMaps)

  if (eligible.length < count) {
    throw new Error(`At least ${count} eligible ${requiredDifficulty} Match courses are required.`)
  }

  const shuffled = [...eligible]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]]
  }

  return shuffled.slice(0, count).map(({ code, baseMap, difficulty, displayName }) => ({
    code,
    baseMap,
    difficulty,
    displayName,
  }))
}

export function resolveMatchCourseChoice(
  firstChoice: MatchCourseChoice,
  secondChoice: MatchCourseChoice,
  random: () => number = Math.random,
): MatchCourseChoice {
  if (firstChoice.code === secondChoice.code) return firstChoice
  return random() < 0.5 ? firstChoice : secondChoice
}

export function isMatchMapLocked(
  candidate: MatchCourseChoice,
  selectedCourses: MatchCourseChoice[],
): boolean {
  const candidateMap = normalizeMatchMapKey(candidate.baseMap)
  return selectedCourses.some((selected) => normalizeMatchMapKey(selected.baseMap) === candidateMap)
}

export function preserveCommittedMatchCourse(
  committed: MatchCourseChoice | null,
  newlyProposed: MatchCourseChoice,
): MatchCourseChoice {
  return committed || newlyProposed
}
