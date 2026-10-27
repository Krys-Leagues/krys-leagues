export type PublicTournamentRound = {
  round_number: number
  name: string
  course_config: Record<string, unknown>
  scoring_rules: Record<string, unknown>
  tiebreaker_rules: Record<string, unknown>
  deadline_at?: string | null
  schedule_timezone?: string | null
  is_final: boolean
}

export type CourseDetail = { name: string; difficulty: "Easy" | "Hard" | "Configured" }

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function difficultyFor(name: string, key?: string): CourseDetail["difficulty"] {
  const source = `${key ?? ""} ${name}`.toLowerCase()
  if (source.includes("easy")) return "Easy"
  if (source.includes("hard")) return "Hard"
  return "Configured"
}

export function courseDetails(rounds: PublicTournamentRound[]): CourseDetail[] {
  const courses = new Map<string, CourseDetail>()
  for (const round of rounds) {
    const config = asObject(round.course_config)
    for (const [key, value] of Object.entries(config)) {
      if (typeof value !== "string" || !value.trim()) continue
      const name = value.trim()
      const difficulty = difficultyFor(name, key)
      const existing = courses.get(name)
      if (!existing || existing.difficulty === "Configured") courses.set(name, { name, difficulty })
    }
  }
  return [...courses.values()]
}

export function pointRules(rules: Record<string, unknown>): { label: string; points: number }[] {
  const scoring = asObject(rules.scoring)
  const entries: Array<[string, string]> = [
    ["hole_in_one", "Hole-in-one"], ["condor", "Condor"], ["albatross", "Albatross"],
    ["eagle", "Eagle"], ["birdie", "Birdie"], ["par_or_worse", "Par or worse"],
  ]
  return entries.flatMap(([key, label]) => typeof scoring[key] === "number" ? [{ label, points: scoring[key] as number }] : [])
}

export function formatSchedule(value: string | null | undefined, timeZone: string | null | undefined): string {
  if (!value) return "To Be Announced"
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short", timeZone: timeZone || "UTC" }).format(new Date(value))
  } catch {
    return "To Be Announced"
  }
}

export function formatCourseSummary(rounds: PublicTournamentRound[]): string {
  const courses = courseDetails(rounds)
  return courses.length ? courses.map((course) => `${course.name} (${course.difficulty})`).join(" · ") : "To Be Announced"
}

export function formatTiebreaker(rounds: PublicTournamentRound[]): string {
  const finalRound = rounds.find((round) => round.is_final)
  const rules = asObject(finalRound?.tiebreaker_rules)
  const course = typeof rules.course === "string" ? rules.course : ""
  const policy = typeof rules.policy === "string" ? rules.policy : ""
  if (!course && !policy) return "To Be Announced"
  if (course && policy === "back_nine_then_front_nine_sudden_death") return `${course} back nine, then front-nine sudden death.`
  return course || policy
}
