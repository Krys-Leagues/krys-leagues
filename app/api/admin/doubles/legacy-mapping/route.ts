import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

export async function GET() {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const { data, error } = await authorization.supabase.rpc("list_doubles_legacy_mapping_review")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ mappings: data ?? [] })
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  try {
    const body = await request.json()
    if (body.action !== "approve") return NextResponse.json({ error: "Unsupported mapping action" }, { status: 400 })
    const { data, error } = await authorization.supabase.rpc("approve_doubles_legacy_mapping", { p_review_id: body.mapping_id, p_global_team_id: body.global_team_id, p_season_team_id: body.season_team_id })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ id: data })
  } catch {
    return NextResponse.json({ error: "Invalid mapping request" }, { status: 400 })
  }
}
