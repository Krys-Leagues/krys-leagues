import type { ArizonaCourseCode, ArizonaDifficulty } from "./types.ts"

export const ARIZONA_BASE_MAP = "Arizona Modern" as const
export const ARIZONA_SOURCE_COURSE = "Arazona Modern" as const
export const ALL_TIME_WORKSHEET = "All Time" as const

export const ARIZONA_COURSES = {
  Easy: {
    code: "AME" as ArizonaCourseCode,
    difficulty: "Easy" as ArizonaDifficulty,
    baseMap: ARIZONA_BASE_MAP,
    displayName: "Arizona Modern Easy" as const,
  },
  Hard: {
    code: "AMH" as ArizonaCourseCode,
    difficulty: "Hard" as ArizonaDifficulty,
    baseMap: ARIZONA_BASE_MAP,
    displayName: "Arizona Modern Hard" as const,
  },
} as const

export function mapArizonaCourse(
  sourceCourseName: string,
  difficulty: string
) {
  if (sourceCourseName !== ARIZONA_SOURCE_COURSE) return null
  if (difficulty !== "Easy" && difficulty !== "Hard") return null
  return ARIZONA_COURSES[difficulty]
}
