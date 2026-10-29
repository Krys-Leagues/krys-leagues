export async function fetchMajorPublicData<T>(resource: string, params: Record<string, string | undefined> = {}) {
  const query = new URLSearchParams({ resource })
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value)
  }
  const response = await fetch(`/api/majors/data?${query.toString()}`, { cache: "no-store" })
  const payload = await response.json() as { error?: string } & T
  if (!response.ok) throw new Error(payload.error || "Public Major data could not be loaded.")
  return payload
}
