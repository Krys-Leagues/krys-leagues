export async function recoveryAdminRpc<T = unknown>(name: string, args: Record<string, unknown>) {
  const response = await fetch("/api/admin/recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, args }) })
  const payload = await response.json() as { data?: T; error?: string }
  return { data: payload.data ?? null, error: payload.error ? new Error(payload.error) : response.ok ? null : new Error("Recovery admin request failed.") }
}

class RecoveryRead<T = unknown> {
  private readonly query: Record<string, unknown> = {}
  constructor(private readonly table: string) {}
  select(value: string, options?: unknown) { this.query.select = value; if (options) this.query.options = options; return this }
  eq(column: string, value: unknown) { this.query.eq = { ...(this.query.eq as object || {}), [column]: value }; return this }
  in(column: string, values: unknown[]) { this.query.in = { ...(this.query.in as object || {}), [column]: values }; return this }
  order(column: string, options?: unknown) { this.query.order = { column, options }; return this }
  maybeSingle() { this.query.single = true; return this }
  then<TResult1 = { data?: T; error: Error | null }, TResult2 = never>(onfulfilled?: ((value: { data?: T; error: Error | null }) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) { return recoveryAdminRead<T>(this.table, this.query).then(onfulfilled, onrejected) }
}
export function recoveryAdminTable<T = unknown>(table: string) { return new RecoveryRead<T>(table) }
export async function recoveryAdminRead<T>(table: string, query: Record<string, unknown>) {
  const response = await fetch("/api/admin/recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "read", table, query }) })
  const payload = await response.json() as { data?: T; error?: string }
  return { data: payload.data, error: payload.error ? new Error(payload.error) : response.ok ? null : new Error("Recovery admin read failed.") }
}

export async function recoveryAdminStorage(action: "upload" | "remove", path: string, file?: File) {
  const form = new FormData(); form.set("action", action); form.set("path", path); if (file) form.set("file", file)
  const response = await fetch("/api/admin/recovery", { method: "POST", body: form })
  const payload = await response.json() as { error?: string }
  return { error: payload.error ? new Error(payload.error) : response.ok ? null : new Error("Recovery storage request failed.") }
}
