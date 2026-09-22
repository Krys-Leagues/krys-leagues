import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createAdminServiceClient } from "@/lib/admin/adminServiceClient"

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const body = await request.json() as { division?: string }
  const result = await createAdminServiceClient()
    .from("players")
    .select("screen_name")
    .eq("active", true)
    .eq("division", String(body.division || ""))
    .order("screen_name", { ascending: true })
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ data: (result.data || []).map((player) => player.screen_name) }, { headers: { "Cache-Control": "no-store" } })
}
