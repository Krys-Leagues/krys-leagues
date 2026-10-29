export type PublicScheduleReadResult<T = Record<string, unknown>> = {
  data: T[]
  error: { message: string } | null
}

export async function fetchPublicSchedule<T = Record<string, unknown>>(): Promise<PublicScheduleReadResult<T>> {
  try {
    const response = await fetch("/api/public/schedule", { cache: "no-store" })
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
