import { loadPublicProfileMemberships } from "@/lib/publicProfiles/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export async function GET(request: Request) {
  const playerId = new URL(request.url).searchParams.get("playerId")?.trim() || ""
  if (!isUuid(playerId)) return Response.json({ error: "A valid canonical player ID is required." }, { status: 400 })
  try {
    const memberships = await loadPublicProfileMemberships(playerId)
    if (!memberships) return Response.json({ error: "Player not found." }, { status: 404 })
    return Response.json({ memberships }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=120" } })
  } catch (error) {
    console.error("[public-profile-memberships] read failed", error)
    return Response.json({ error: "Player league history is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
