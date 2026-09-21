type MajorAction = "events_load" | "entries_load" | "verification_load" | "rpc" | "table_read" | "play_day_upsert" | "time_slot_update" | "time_slot_delete"

export async function majorAdminRequest<T>(action: MajorAction, body: Record<string, unknown> = {}) {
  const response = await fetch("/api/admin/majors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }) })
  const payload = await response.json() as { data?: T; error?: string }
  return { data: payload.data, error: payload.error ? new Error(payload.error) : response.ok ? null : new Error("Major admin request failed.") }
}

export async function majorAdminRpc<T = unknown>(name: string, args: Record<string, unknown>) {
  return majorAdminRequest<T>("rpc", { name, args })
}

export async function majorAdminRead<T>(table: string, query: { select: string; eq?: Record<string, unknown>; in?: Record<string, unknown[]>; order?: { column: string; ascending?: boolean }; single?: boolean }) {
  return majorAdminRequest<T>("table_read", { table, query })
}

export async function majorAdminTableMutation<T>(action: "play_day_upsert" | "time_slot_update" | "time_slot_delete", body: Record<string, unknown>) { return majorAdminRequest<T>(action, body) }
