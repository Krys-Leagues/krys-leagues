import { loadPublicProfileSearch } from "@/lib/publicProfiles/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const search = new URL(request.url).searchParams.get("search")
    const players = await loadPublicProfileSearch(search)
    return Response.json({ players }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=120" } })
  } catch (error) {
    console.error("[public-profile-search] read failed", error)
    return Response.json({ code: "public_profile_search_unavailable", message: "Player profiles are temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
