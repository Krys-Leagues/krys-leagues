import { loadPublicLeagueBoard, PUBLIC_LEAGUE_KINDS, type PublicLeagueKind } from "@/lib/publicLeague/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("kind")
  if (!PUBLIC_LEAGUE_KINDS.includes(kind as PublicLeagueKind)) {
    return Response.json({ error: "Unknown public league board." }, { status: 400 })
  }

  try {
    const board = await loadPublicLeagueBoard(kind as PublicLeagueKind)
    return Response.json(board, { headers: { "Cache-Control": "public, max-age=30, s-maxage=120" } })
  } catch (error) {
    console.error("[public-league-board] read failed", error)
    return Response.json({ error: "This public league board is temporarily unavailable." }, { status: 503 })
  }
}
