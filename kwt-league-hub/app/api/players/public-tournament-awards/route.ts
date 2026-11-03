import { NextResponse } from "next/server"

import { isMissingTournamentSchema, trustedTournamentClient } from "@/lib/tournaments/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const TROPHY_BUCKET = "tournament-trophies"


export async function GET(request: Request) {
  const requestedId = new URL(request.url).searchParams.get("playerId")?.trim()
  if (!requestedId) return NextResponse.json({ awards: [] }, { headers: { "Cache-Control": "no-store" } })
  try {
    const client = trustedTournamentClient()
    const canonicalResult = await client.rpc("resolve_canonical_player_id", { p_player_id: requestedId })
    if (canonicalResult.error) throw canonicalResult.error
    const canonicalId = typeof canonicalResult.data === "string" ? canonicalResult.data : requestedId
    const player = await client.from("players").select("id,active,status").eq("id", canonicalId).maybeSingle()
    if (player.error) throw player.error
    if (!player.data || player.data.active !== true || ["retired", "merged", "archived"].includes(String(player.data.status || "").toLowerCase())) return NextResponse.json({ awards: [] }, { headers: { "Cache-Control": "no-store" } })
    const awardsResult = await client.from("tournament_awards").select("id,tournament_id,personalized_storage_path,created_at,status").eq("winner_player_id", canonicalId).in("status", ["approved", "awarded"]).order("created_at", { ascending: false })
    if (awardsResult.error) throw awardsResult.error
    const rows = awardsResult.data || []
    const tournamentIds = [...new Set(rows.map((row) => row.tournament_id))]
    const tournaments = tournamentIds.length ? await client.from("tournaments").select("id,name").in("id", tournamentIds) : { data: [], error: null }
    if (tournaments.error) throw tournaments.error
    const names = new Map((tournaments.data || []).map((row) => [row.id, row.name]))
    const awards = (await Promise.all(rows.filter((row) => row.personalized_storage_path).map(async (row) => {
      const signed = await client.storage.from(TROPHY_BUCKET).createSignedUrl(row.personalized_storage_path, 3600)
      if (signed.error) return null
      return { id: `tournament-award-${row.id}`, trophy_title: "Champion", placement: "Champion", event_name: names.get(row.tournament_id) || "Tournament", division: null, season: null, month: null, week: null, image_url: signed.data.signedUrl, created_at: row.created_at }
    }))).filter((award): award is NonNullable<typeof award> => Boolean(award))
    // KWT awards are linked to the canonical player_trophies row when awarded.
    // Keeping this endpoint focused on Tournament Builder awards prevents a
    // single KWT award from being displayed twice on profiles.
    return NextResponse.json({ awards }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const detail = error as { code?: string; message?: string } | null
    if (isMissingTournamentSchema(detail)) return NextResponse.json({ awards: [] }, { headers: { "Cache-Control": "no-store" } })
    return NextResponse.json({ error: "Tournament awards are temporarily unavailable.", awards: [] }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
