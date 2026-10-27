export type HandicapDifficulty = "easy" | "hard"

export type OfficialCourse = {
  id: string
  baseMap: string
  difficulty: HandicapDifficulty
}

export type HistoricalCourseInput = {
  rawCourseKey: string
  rawCourseName?: string | null
  difficulty?: string | null
  courseId?: string | null
  sourceKey?: string
}

export type CourseKeyResolution = {
  rawCourseKey: string
  rawCourseName?: string | null
  sourceKey?: string
  status: "resolved" | "unresolved" | "ambiguous"
  officialCourseId?: string
  officialBaseMap?: string
  difficulty?: HandicapDifficulty
  reason:
    | "EXACT_COURSE_ID"
    | "EXACT_CANONICAL_NAME"
    | "INVALID_DIFFICULTY"
    | "NO_EXACT_CATALOG_MATCH"
    | "AMBIGUOUS_CATALOG_MATCH"
    | "COURSE_ID_DIFFICULTY_MISMATCH"
  candidates: readonly string[]
}

export function normalizeCourseName(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US")
}

export function normalizeDifficulty(value: string | null | undefined): HandicapDifficulty | undefined {
  const normalized = value?.trim().toLocaleLowerCase("en-US")
  return normalized === "easy" || normalized === "hard" ? normalized : undefined
}

function inputBaseMap(input: HistoricalCourseInput): string {
  if (input.rawCourseName?.trim()) return input.rawCourseName.trim()
  const separator = input.rawCourseKey.lastIndexOf("_")
  return separator > 0 ? input.rawCourseKey.slice(0, separator) : input.rawCourseKey
}

export function resolveCourseKey(
  input: HistoricalCourseInput,
  catalog: readonly OfficialCourse[],
): CourseKeyResolution {
  const difficulty = normalizeDifficulty(input.difficulty) ??
    normalizeDifficulty(input.rawCourseKey.slice(input.rawCourseKey.lastIndexOf("_") + 1))

  if (!difficulty) {
    return {
      rawCourseKey: input.rawCourseKey,
      rawCourseName: input.rawCourseName,
      sourceKey: input.sourceKey,
      status: "unresolved",
      reason: "INVALID_DIFFICULTY",
      candidates: [],
    }
  }

  if (input.courseId) {
    const byId = catalog.find((course) => course.id === input.courseId)
    if (byId && byId.difficulty === difficulty) {
      return {
        rawCourseKey: input.rawCourseKey,
        rawCourseName: input.rawCourseName,
        sourceKey: input.sourceKey,
        status: "resolved",
        officialCourseId: byId.id,
        officialBaseMap: byId.baseMap,
        difficulty,
        reason: "EXACT_COURSE_ID",
        candidates: [byId.id],
      }
    }
    if (byId) {
      return {
        rawCourseKey: input.rawCourseKey,
        rawCourseName: input.rawCourseName,
        sourceKey: input.sourceKey,
        status: "unresolved",
        difficulty,
        reason: "COURSE_ID_DIFFICULTY_MISMATCH",
        candidates: [byId.id],
      }
    }
  }

  const normalizedBaseMap = normalizeCourseName(inputBaseMap(input))
  const matches = catalog.filter(
    (course) =>
      course.difficulty === difficulty &&
      normalizeCourseName(course.baseMap) === normalizedBaseMap,
  )

  if (matches.length === 1) {
    const match = matches[0]
    return {
      rawCourseKey: input.rawCourseKey,
      rawCourseName: input.rawCourseName,
      sourceKey: input.sourceKey,
      status: "resolved",
      officialCourseId: match.id,
      officialBaseMap: match.baseMap,
      difficulty,
      reason: "EXACT_CANONICAL_NAME",
      candidates: [match.id],
    }
  }
  if (matches.length > 1) {
    return {
      rawCourseKey: input.rawCourseKey,
      rawCourseName: input.rawCourseName,
      sourceKey: input.sourceKey,
      status: "ambiguous",
      difficulty,
      reason: "AMBIGUOUS_CATALOG_MATCH",
      candidates: matches.map((match) => match.id).sort(),
    }
  }

  return {
    rawCourseKey: input.rawCourseKey,
    rawCourseName: input.rawCourseName,
    sourceKey: input.sourceKey,
    status: "unresolved",
    difficulty,
    reason: "NO_EXACT_CATALOG_MATCH",
    candidates: [],
  }
}

export function resolveCourseKeys(
  inputs: readonly HistoricalCourseInput[],
  catalog: readonly OfficialCourse[],
): readonly CourseKeyResolution[] {
  return inputs.map((input) => resolveCourseKey(input, catalog))
}
