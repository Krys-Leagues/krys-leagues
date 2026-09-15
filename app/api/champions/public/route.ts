import { loadPublicChampionTrophies } from "@/lib/champions/public"
import type { ChampionScope } from "@/lib/championScope"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const championScopes = new Set<ChampionScope>([
  "all",
  "kwt",
  "champion-of-champions",
  "krys-cup",
  "spicy-cup",
  "monthly",
  "bracket",
])

export async function GET(request: Request) {
  const requestedScope = new URL(request.url).searchParams.get("scope") || "all"
  if (!championScopes.has(requestedScope as ChampionScope)) {
    return Response.json({ message: "Choose a valid Hall of Champions view." }, { status: 400 })
  }

  try {
    const trophies = await loadPublicChampionTrophies(requestedScope as ChampionScope)
    return Response.json(
      { trophies },
      { headers: { "Cache-Control": "public, max-age=30, s-maxage=120" } },
    )
  } catch (error) {
    console.error("[public-champions] read failed", error)
    return Response.json(
      { message: "Hall of Champions is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }
}
