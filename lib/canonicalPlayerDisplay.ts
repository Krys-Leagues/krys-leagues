import {
  type CanonicalPlayerDisplay,
} from "@/lib/canonicalPlayerDisplayCore"

export * from "@/lib/canonicalPlayerDisplayCore"

export async function loadCanonicalPlayerDisplays(sourcePlayerIds: string[]): Promise<{
  data: CanonicalPlayerDisplay[]
  error: Error | null
}> {
  const uniqueSourceIds = Array.from(new Set(sourcePlayerIds.filter(Boolean)))
  if (uniqueSourceIds.length === 0) return { data: [], error: null }

  const response = await fetch(`/api/public/players?mode=display&ids=${encodeURIComponent(uniqueSourceIds.join(","))}`, { cache: "no-store" })
  const payload = await response.json() as { data?: CanonicalPlayerDisplay[]; error?: string }
  if (!response.ok) return { data: [], error: new Error(payload.error || "Public player names could not be loaded.") }
  return { data: payload.data || [], error: null }
}
