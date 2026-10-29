export async function fetchMajorAdminData<T>(resource: string, params: Record<string, string | undefined> = {}) {
  const query = new URLSearchParams({ resource })
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value)
  }
  const response = await fetch(`/api/admin/majors/data?${query.toString()}`, { cache: "no-store" })
  const payload = await response.json() as { error?: string } & T
  if (!response.ok) throw new Error(payload.error || "Protected Major data could not be loaded.")
  return payload
}

export async function mutateMajorAdminData<T>(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/majors/data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const payload = await response.json() as { error?: string } & T
  if (!response.ok) throw new Error(payload.error || "Protected Major change could not be saved.")
  return payload
}
