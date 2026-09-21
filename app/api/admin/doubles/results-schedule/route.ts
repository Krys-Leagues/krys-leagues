import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createAdminServiceClient } from "@/lib/admin/adminServiceClient"

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const body = await request.json() as { division?: string; seasonNumber?: number }
  const result = await createAdminServiceClient()
    .from("schedule")
    .select("id, league_type, division, season_number, game, course, player1, player2")
    .eq("league_type", "doubles")
    .eq("division", String(body.division || ""))
    .eq("season_number", Number(body.seasonNumber))
    .order("game", { ascending: true })
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ data: result.data || [] }, { headers: { "Cache-Control": "no-store" } })
}
