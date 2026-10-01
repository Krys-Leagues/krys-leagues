export type AuthoritativeCourse = {
  id: string
  code: string
  base_map: string | null
  display_name: string
  difficulty: "Easy" | "Hard"
  hole_pars: number[] | null
  par: number | null
}

function normalized(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
}

function fixtureParts(label: string) {
  const trimmed = label.trim()
  const difficultyMatch = trimmed.match(/\b(easy|hard)\s*$/i)
  const difficulty = difficultyMatch
    ? difficultyMatch[1].toLowerCase() === "easy" ? "Easy" as const : "Hard" as const
    : null
  const base = difficultyMatch ? trimmed.slice(0, difficultyMatch.index).trim() : trimmed
  return { full: normalized(trimmed), base: normalized(base), difficulty }
}

function courseBase(course: AuthoritativeCourse) {
  const base = course.base_map?.trim() || course.display_name.replace(/\b(Easy|Hard)\s*$/i, "").trim()
  return normalized(base)
}

/**
 * Resolve league schedule labels against the canonical course catalog.
 *
 * Historical/current schedules may use a unique shorthand such as GLOOP EASY,
 * while the catalog stores Gloop Lair / Easy. Exact code/name/base matches win;
 * a shorthand prefix is accepted only when it identifies exactly one course at
 * the requested difficulty. Ambiguity always fails closed.
 */
export function resolveAuthoritativeCourse(
  fixtureLabel: string,
  courses: AuthoritativeCourse[],
): AuthoritativeCourse | null {
  const fixture = fixtureParts(fixtureLabel)
  if (!fixture.full || !fixture.base) return null

  const eligible = courses.filter((course) => !fixture.difficulty || course.difficulty === fixture.difficulty)
  const exact = eligible.filter((course) => {
    const display = normalized(course.display_name)
    const code = normalized(course.code)
    const base = courseBase(course)
    return fixture.full === display || fixture.full === code || fixture.base === base || fixture.base === display
  })
  if (exact.length === 1) return exact[0]
  if (exact.length > 1 || fixture.base.length < 4) return null

  const uniqueShorthand = eligible.filter((course) => courseBase(course).startsWith(fixture.base))
  return uniqueShorthand.length === 1 ? uniqueShorthand[0] : null
}
