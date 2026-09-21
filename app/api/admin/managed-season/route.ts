import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  try {
    const body = await request.json() as Record<string, unknown>
    if (body.action !== "preview" && body.action !== "delete") return NextResponse.json({ error: "Unsupported managed-season action." }, { status: 400 })
    const historical = Boolean(body.historical)
    const name = body.action === "preview"
      ? (historical ? "preview_historical_season_deletion" : "preview_managed_season_deletion")
      : (historical ? "delete_historical_season" : "delete_managed_season")
    const result = await authorization.supabase.rpc(name, { p_season_id: String(body.seasonId || "") })
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
    return NextResponse.json({ data: Array.isArray(result.data) ? result.data[0] : result.data }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Managed-season action failed." }, { status: 400 })
  }
}
