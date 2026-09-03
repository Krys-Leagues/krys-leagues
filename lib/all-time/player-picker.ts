export type CanonicalPlayerOption = {
  id: string
  screen_name: string
}

export function filterCanonicalPlayers<T extends CanonicalPlayerOption>(players: readonly T[], query: string, limit = 20) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery || limit <= 0) return [] as T[]
  return players
    .filter((player) => player.screen_name.toLowerCase().includes(normalizedQuery))
    .slice(0, limit)
}

export type CanonicalCourseOption = {
  id: string
  code: string
  display_name: string
  difficulty: "Easy" | "Hard"
}

export function formatCanonicalCourse<T extends CanonicalCourseOption>(course: T) {
  const displayName = course.display_name.trim()
  return displayName.toLowerCase().endsWith(` ${course.difficulty.toLowerCase()}`)
    ? displayName
    : `${displayName} — ${course.difficulty}`
}

export function filterCanonicalCourses<T extends CanonicalCourseOption>(courses: readonly T[], query: string, limit = 20) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery || limit <= 0) return [] as T[]
  return courses
    .filter((course) => `${course.display_name} ${course.code}`.toLowerCase().includes(normalizedQuery))
    .slice(0, limit)
}
