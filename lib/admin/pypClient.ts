"use client"

export async function adminPypRequest<T = unknown>(action: string, args: Record<string, unknown> = {}) {
  const response = await fetch("/api/admin/pyp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ action, ...args }),
  })
  const payload = await response.json().catch(() => ({})) as { data?: T; error?: string }
  return { data: payload.data ?? null, error: response.ok ? null : new Error(payload.error || "PYP admin request failed.") }
}
