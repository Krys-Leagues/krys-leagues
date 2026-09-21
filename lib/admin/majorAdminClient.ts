type MajorAction = "events_load" | "entries_load" | "verification_load" | "rpc"

export async function majorAdminRequest<T>(action: MajorAction, body: Record<string, unknown> = {}) {
  const response = await fetch("/api/admin/majors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }) })
  const payload = await response.json() as { data?: T; error?: string }
  return { data: payload.data, error: payload.error ? new Error(payload.error) : response.ok ? null : new Error("Major admin request failed.") }
}
