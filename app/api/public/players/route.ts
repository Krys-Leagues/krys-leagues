import "server-only"

import { NextResponse } from "next/server"
import { createTrustedSupabaseClient } from "@/lib/supabase/trustedServer"
import {
  buildCanonicalPlayerDisplays,
  type CanonicalCurrentPlayerRow,
  type CanonicalIdentityResolution,
} from "@/lib/canonicalPlayerDisplayCore"
import {
  buildCanonicalPublicPlayerChoices,
  type CanonicalIdentity,
  type PublicPlayerRow,
} from "@/lib/publicPlayerChoices"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function requestedIds(request: Request) {
  return [...new Set((new URL(request.url).searchParams.get("ids") || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean))]
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const mode = params.get("mode") || "directory"
  const client = createTrustedSupabaseClient()

  if (mode === "names") {
    const ids = requestedIds(request)
    if (ids.length === 0) return NextResponse.json({ data: [] })
    const result = await client.from("players").select("id, screen_name").in("id", ids)
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 503 })
    return NextResponse.json({ data: result.data || [] }, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } })
  }

  if (mode === "display") {
    const sourceIds = requestedIds(request)
    if (sourceIds.length === 0) return NextResponse.json({ data: [] })

    const identityResults = await Promise.all(sourceIds.map((sourceId) =>
      client.rpc("get_public_player_canonical_identity", { p_player_id: sourceId }),
    ))
    const identityError = identityResults.find((result) => result.error)?.error
    if (identityError) return NextResponse.json({ error: identityError.message }, { status: 503 })

    const resolutions: CanonicalIdentityResolution[] = identityResults.map((result, index) => {
      const identity = (Array.isArray(result.data) ? result.data[0] : result.data) as { canonical_player_id?: string } | null
      return {
        source_player_id: sourceIds[index],
        canonical_player_id: typeof identity?.canonical_player_id === "string" ? identity.canonical_player_id : null,
      }
    })
    const canonicalIds = [...new Set(resolutions.map((resolution) => resolution.canonical_player_id).filter(Boolean))] as string[]
    const players = canonicalIds.length
      ? await client.from("players").select("id, screen_name, status, active").in("id", canonicalIds)
      : { data: [], error: null }
    if (players.error) return NextResponse.json({ error: players.error.message }, { status: 503 })

    return NextResponse.json({
      data: buildCanonicalPlayerDisplays(sourceIds, resolutions, (players.data || []) as CanonicalCurrentPlayerRow[]),
    }, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } })
  }

  const players = await client
    .from("players")
    .select("id, screen_name, status, active, avatar_path, is_server_booster, has_krys_server_tag, profile_badges")
    .eq("active", true)
    .order("screen_name", { ascending: true })
  if (players.error) return NextResponse.json({ error: players.error.message }, { status: 503 })

  const rows = (players.data || []) as PublicPlayerRow[]
  const identities = await Promise.all(rows.map((player) =>
    client.rpc("get_public_player_canonical_identity", { p_player_id: player.id }),
  ))
  const identityError = identities.find((result) => result.error)?.error
  if (identityError) return NextResponse.json({ error: identityError.message }, { status: 503 })

  return NextResponse.json({
    data: buildCanonicalPublicPlayerChoices(rows, identities.map((result) =>
      (Array.isArray(result.data) ? result.data[0] : result.data) as CanonicalIdentity | null,
    )),
  }, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } })
}
