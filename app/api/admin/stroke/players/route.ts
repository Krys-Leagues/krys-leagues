import { NextResponse } from "next/server"

import { createAdminDataClient } from "@/lib/adminDataServer"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

// Stroke admin screens may resolve a Global Player identity, but must not
// receive unrelated league memberships, tournament entries, or admin-only
// profile fields from the multi-league directory.
export async function GET() {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  let adminDataClient
  try {
    adminDataClient = createAdminDataClient()
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Stroke Global Players server access is not configured." },
      { status: 503 },
    )
  }

  const [playersResult, identityLinksResult, aliasesResult] = await Promise.all([
    adminDataClient
      .from("players")
      .select("id, screen_name, discord_id, discord_name, discord_username, status, active")
      .order("screen_name", { ascending: true }),
    adminDataClient
      .from("player_identity_links")
      .select("historical_player_id, canonical_player_id"),
    adminDataClient
      .from("player_aliases")
      .select("player_id, alias, source")
      .eq("verified", true)
      .order("alias", { ascending: true }),
  ])

  const error = playersResult.error || identityLinksResult.error || aliasesResult.error
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json(
    {
      players: playersResult.data || [],
      identityLinks: identityLinksResult.data || [],
      aliases: aliasesResult.data || [],
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
