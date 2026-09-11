import { NextResponse } from "next/server"
import { createTrustedSupabaseClient } from "@/lib/supabase/trustedServer"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const playerId = new URL(request.url).searchParams.get("id")?.trim()
  if (!playerId) return NextResponse.json({ error: "Player ID is required." }, { status: 400 })

  const client = createTrustedSupabaseClient()
  const profile = await client.rpc("get_public_player_profile_data", { p_player_id: playerId })
  if (profile.error) return NextResponse.json({ error: profile.error.message }, { status: 503 })

  return NextResponse.json(profile.data, {
    headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=30" },
  })
}
