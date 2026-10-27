import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(_request: Request, context: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await context.params
  if (!uuidPattern.test(teamId)) return NextResponse.json({ error: "Invalid public team" }, { status: 400 })
  const client = await createServerSupabaseClient()
  const { data, error } = await client.rpc("get_public_doubles_team_profile", { p_global_team_id: teamId })
  if (error) return NextResponse.json({ error: "Public team profile is unavailable" }, { status: 503 })
  if (!data?.team) return NextResponse.json({ error: "Team not found" }, { status: 404 })
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store, max-age=30" } })
}
