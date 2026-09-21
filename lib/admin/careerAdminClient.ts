export async function loadAdminCareerData<T>() {
  const response = await fetch("/api/admin/career", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
  const payload = await response.json() as { data?: T; error?: string }
  return { data: payload.data, error: payload.error ? new Error(payload.error) : response.ok ? null : new Error("Career admin request failed.") }
}
