import type { CanonicalPublicPlayer } from "@/lib/publicPlayerChoices"

export type { CanonicalPublicPlayer } from "@/lib/publicPlayerChoices"

export async function loadCanonicalPublicPlayers(): Promise<{
  data: CanonicalPublicPlayer[]
  error: Error | null
}> {
  const response = await fetch("/api/public/players?mode=directory", { cache: "no-store" })
  const payload = await response.json() as { data?: CanonicalPublicPlayer[]; error?: string }
  if (!response.ok) return { data: [], error: new Error(payload.error || "Public players could not be loaded.") }
  return { data: payload.data || [], error: null }
}
