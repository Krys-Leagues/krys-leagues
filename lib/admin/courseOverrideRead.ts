export type CourseOverrideLeague = "match" | "stroke"

export type AdminCourseOverrideReadResult = {
  data: unknown
  error: { message: string } | null
}

export async function fetchAdminDivisionCourseOverrides(
  league: CourseOverrideLeague,
  seasonId: string,
  divisionNumber?: number
): Promise<AdminCourseOverrideReadResult> {
  const params = new URLSearchParams({ seasonId })
  if (divisionNumber !== undefined) {
    params.set("divisionNumber", String(divisionNumber))
  }

  const response = await fetch(
    `/api/admin/${league}/division-course-overrides?${params.toString()}`,
    { cache: "no-store" }
  )

  let payload: { data?: unknown; error?: string } = {}
  try {
    payload = (await response.json()) as { data?: unknown; error?: string }
  } catch {
    payload = {}
  }

  if (!response.ok) {
    return {
      data: null,
      error: {
        message:
          payload.error ||
          `Could not load ${league} division course overrides (${response.status}).`,
      },
    }
  }

  return { data: payload.data ?? null, error: null }
}
