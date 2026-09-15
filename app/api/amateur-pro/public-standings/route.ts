import {
  loadPublicAmateurProStandings,
  validAmateurProDivision,
  validSeasonNumber,
} from "@/lib/amateurPro/publicStandings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const division = params.get("division")
  const season = validSeasonNumber(params.get("season"))

  if (!validAmateurProDivision(division) || season === null) {
    return Response.json(
      { message: "Choose a valid division and season." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    )
  }

  try {
    const standings = await loadPublicAmateurProStandings(division!, season)
    return Response.json(
      { standings },
      { headers: { "Cache-Control": "public, max-age=30, s-maxage=120" } },
    )
  } catch (error) {
    console.error("[public-amateur-pro-standings] read failed", error)
    return Response.json(
      { message: "Standings are temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }
}
