import { NextResponse } from "next/server"
import { createTrustedSupabaseClient } from "@/lib/supabase/trustedServer"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const playerId = new URL(request.url).searchParams.get("id")?.trim()
  if (!playerId) return NextResponse.json({ error: "Player ID is required." }, { status: 400 })

  const client = createTrustedSupabaseClient()

  // Keep this compatibility route server-side and narrow. The deployed database
  // has the canonical identity RPC, but its older bundled profile RPC still
  // references a result column that is not present in the production schema.
  const identity = await client.rpc("get_public_player_canonical_identity", { p_player_id: playerId })
  if (identity.error) return NextResponse.json({ error: identity.error.message }, { status: 503 })

  const resolved = (Array.isArray(identity.data) ? identity.data[0] : identity.data) as {
    canonical_player_id?: string
    identity_player_ids?: string[]
  } | null
  const canonicalId = resolved?.canonical_player_id
  if (!canonicalId) {
    return NextResponse.json({ player: null, memberships: [], results: [] }, {
      headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=30" },
    })
  }

  const identityIds = [...new Set(
    (Array.isArray(resolved?.identity_player_ids) ? resolved.identity_player_ids : []).filter(Boolean).concat(canonicalId),
  )]
  const [player, memberships, results] = await Promise.all([
    client
      .from("players")
      .select("id, screen_name, status, active")
      .eq("id", canonicalId)
      .maybeSingle(),
    client
      .from("player_league_memberships")
      .select("id, league_type, division, season_number")
      .in("player_id", identityIds)
      .order("season_number", { ascending: false }),
    client
      .from("results")
      .select("id, player1, player2, player1_id, player2_id, winner, is_draw")
      .or(`player1_id.in.(${identityIds.join(",")}),player2_id.in.(${identityIds.join(",")})`)
      .limit(500),
  ])

  if (player.error) return NextResponse.json({ error: player.error.message }, { status: 503 })
  if (memberships.error) return NextResponse.json({ error: memberships.error.message }, { status: 503 })

  return NextResponse.json({
    player: player.data || null,
    memberships: memberships.data || [],
    // Results are supplemental to the profile. Keep a schema-compatible subset
    // and do not let an unrelated legacy result mismatch hide the player.
    results: results.error ? [] : (results.data || []),
  }, {
    headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=30" },
  })
}
