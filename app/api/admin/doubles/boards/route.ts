import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createDoublesRuntimeClient } from "@/lib/doublesParticipantServer"

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const params = new URL(request.url).searchParams
  const client = createDoublesRuntimeClient()
  const seasonId = params.get("season_id")
  const division = params.get("division")
  const [mapping, fixtures, results, standings] = await Promise.all([
    client.from("doubles_discord_division_mappings").select("*").eq("season_id", seasonId).eq("division", division).maybeSingle(),
    client.from("doubles_managed_fixtures").select("*").eq("season_id", seasonId).eq("division", division).order("game_number"),
    client.from("doubles_managed_results").select("*").in("fixture_id", (await client.from("doubles_managed_fixtures").select("id").eq("season_id", seasonId).eq("division", division)).data?.map((row) => row.id) || []),
    client.from("doubles_managed_standings").select("*").eq("season_id", seasonId).eq("division", division).order("rank"),
  ])
  if (mapping.error || fixtures.error || results.error || standings.error) return NextResponse.json({ error: "Doubles board state is unavailable." }, { status: 503 })
  return NextResponse.json({ mapping: mapping.data, fixtures: fixtures.data ?? [], results: results.data ?? [], standings: standings.data ?? [] })
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  let body: { action?: string; mapping_id?: string; channel_id?: string; message_id?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid board request" }, { status: 400 }) }
  if (!body.mapping_id || !body.action) return NextResponse.json({ error: "mapping_id and action are required" }, { status: 400 })
  const client = createDoublesRuntimeClient()

  if (body.action === "retry") {
    const mapping = await client.from("doubles_discord_division_mappings").select("id,season_id,division,board_channel_id").eq("id", body.mapping_id).maybeSingle()
    if (mapping.error || !mapping.data) return NextResponse.json({ error: "Board mapping not found" }, { status: 404 })
    if (!mapping.data.board_channel_id) return NextResponse.json({ error: "Board channel is not bound" }, { status: 409 })
    await client.from("doubles_discord_division_mappings").update({ board_state: "PENDING", updated_at: new Date().toISOString() }).eq("id", body.mapping_id)
    const outbox = await client.from("doubles_discord_event_outbox").insert({ event_type: "BOARD_REFRESH", season_id: mapping.data.season_id, division: mapping.data.division, channel_id: mapping.data.board_channel_id, payload: { seasonId: mapping.data.season_id, division: mapping.data.division, channelId: mapping.data.board_channel_id }, idempotency_key: `${body.mapping_id}:admin-retry:${Date.now()}` })
    if (outbox.error) return NextResponse.json({ error: outbox.error.message }, { status: 400 })
    return NextResponse.json({ queued: true })
  }

  if (body.action === "rebind") {
    if (!body.channel_id || !body.message_id) return NextResponse.json({ error: "Explicit channel_id and message_id are required" }, { status: 400 })
    const result = await client.from("doubles_discord_division_mappings").update({ board_channel_id: body.channel_id, board_message_id: body.message_id, board_state: "PENDING", updated_at: new Date().toISOString() }).eq("id", body.mapping_id).select("id,board_channel_id,board_message_id,board_state").maybeSingle()
    if (result.error || !result.data) return NextResponse.json({ error: "Board mapping not found" }, { status: 404 })
    return NextResponse.json({ mapping: result.data, queued: false })
  }

  return NextResponse.json({ error: "Unsupported board action" }, { status: 400 })
}
