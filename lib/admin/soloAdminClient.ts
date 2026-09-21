export async function soloAdminRpc<T>(name: string, args: Record<string, unknown>) {
  const response = await fetch("/api/admin/solo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, args }) })
  const payload = await response.json() as { data?: T; error?: string }
  return { data: payload.data, error: payload.error ? new Error(payload.error) : response.ok ? null : new Error("Solo admin request failed.") }
}

export async function soloAdminLoad<T>(action: string, body: Record<string, unknown> = {}) {
  const response = await fetch("/api/admin/solo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }) })
  const payload = await response.json() as { data?: T; error?: string }
  return { data: payload.data, error: payload.error ? new Error(payload.error) : response.ok ? null : new Error("Solo admin request failed.") }
}

class SoloQuery<T = unknown> {
  private readonly ops: Record<string, unknown> = {}
  constructor(private readonly table: string) {}
  select(value: string, options?: unknown) { this.ops.select = value; if (options) this.ops.options = options; return this }
  eq(column: string, value: unknown) { this.ops.eq = { ...(this.ops.eq as object || {}), [column]: value }; return this }
  in(column: string, values: unknown[]) { this.ops.in = { ...(this.ops.in as object || {}), [column]: values }; return this }
  order(column: string, options?: unknown) { this.ops.order = { column, options }; return this }
  maybeSingle() { this.ops.single = true; return this }
  then<TResult1 = { data?: T; error: Error | null }, TResult2 = never>(onfulfilled?: ((value: { data?: T; error: Error | null }) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) { return soloAdminLoad<T>("query", { table: this.table, ops: this.ops }).then(onfulfilled, onrejected) }
}
export function soloAdminTable<T = unknown>(table: string) { return new SoloQuery<T>(table) }
