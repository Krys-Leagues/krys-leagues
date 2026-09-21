import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createAdminServiceClient } from "@/lib/admin/adminServiceClient"

export async function POST() {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const result = await createAdminServiceClient()
    .from("players")
    .select("id, screen_name, player_name, name, discord_name")
    .eq("active", true)
    .order("id", { ascending: true })
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ data: result.data || [] }, { headers: { "Cache-Control": "no-store" } })
}
