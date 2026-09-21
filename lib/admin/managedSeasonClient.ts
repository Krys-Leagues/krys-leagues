"use client"

export async function adminManagedSeasonRequest<T = unknown>(action: string, args: Record<string, unknown> = {}) {
  const response = await fetch("/api/admin/managed-season", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ action, ...args }),
  })
  const payload = await response.json().catch(() => ({})) as { data?: T; error?: string }
  return { data: payload.data ?? null, error: response.ok ? null : new Error(payload.error || "Managed-season admin request failed.") }
}
