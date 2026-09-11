export type AdminScheduleReadResult<T = Record<string, unknown>> = {
  data: T[]
  error: { message: string } | null
}

export async function fetchAdminSchedule<T = Record<string, unknown>>(
  params: Record<string, string | number | boolean | null | undefined>,
): Promise<AdminScheduleReadResult<T>> {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") {
      search.set(key, String(value))
    }
  }

  try {
    const response = await fetch(`/api/admin/schedules?${search.toString()}`, {
      credentials: "same-origin",
      cache: "no-store",
    })
    const payload = (await response.json().catch(() => ({}))) as {
      schedule?: T[]
      error?: string
    }
    if (!response.ok) {
      return { data: [], error: { message: payload.error || `Schedule request failed (${response.status}).` } }
    }
    return { data: payload.schedule || [], error: null }
  } catch (error) {
    return { data: [], error: { message: error instanceof Error ? error.message : "Schedule request failed." } }
  }
}
