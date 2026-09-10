export async function postAdminDataMutation<T = unknown>(path: string, body: unknown) {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    })

    const payload = (await response.json().catch(() => ({}))) as {
      data?: T
      error?: string
    }

    if (!response.ok) {
      return { data: null as T | null, error: new Error(payload.error || `Request failed (${response.status})`) }
    }

    return { data: payload.data ?? null, error: null }
  } catch (error) {
    return {
      data: null as T | null,
      error: error instanceof Error ? error : new Error("Request failed"),
    }
  }
}
