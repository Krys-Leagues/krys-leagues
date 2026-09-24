import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  let body: { action?: string; season_id?: string; scorecard_id?: string; note?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid Final Scorecard request" }, { status: 400 }) }
  if (body.action === "generate" && body.season_id) {
    const result = await authorization.supabase.rpc("generate_doubles_final_scorecard", { p_season_id: body.season_id })
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
    return NextResponse.json({ scorecard: Array.isArray(result.data) ? result.data[0] : result.data })
  }
  if (body.action === "approve" && body.scorecard_id) {
    const result = await authorization.supabase.rpc("approve_doubles_final_scorecard", { p_scorecard_id: body.scorecard_id, p_note: body.note?.trim() || null })
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
    return NextResponse.json({ scorecard: result.data })
  }
  if (body.action === "finalize" && body.season_id) {
    const result = await authorization.supabase.rpc("finalize_doubles_season", { p_season_id: body.season_id })
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
    return NextResponse.json({ snapshots_created: result.data })
  }
  return NextResponse.json({ error: "A supported action and identifier are required" }, { status: 400 })
}

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const seasonId = new URL(request.url).searchParams.get("season_id")
  if (!seasonId) return NextResponse.json({ error: "season_id is required" }, { status: 400 })
  const result = await authorization.supabase.from("doubles_final_scorecards").select("*").eq("season_id", seasonId).maybeSingle()
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 503 })
  return NextResponse.json({ scorecard: result.data })
}
