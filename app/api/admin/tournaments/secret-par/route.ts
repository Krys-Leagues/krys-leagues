import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const body = await request.json().catch(() => null) as { tournamentId?: unknown } | null
  if (typeof body?.tournamentId !== "string") return NextResponse.json({ error: "Tournament is required." }, { status: 400 })
  const { data, error } = await authorization.supabase.rpc("admin_record_secret_par_access", { p_tournament_id: body.tournamentId, p_designated_admin: authorization.user.id })
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 400 })
  return NextResponse.json({ accessId: data })
}
