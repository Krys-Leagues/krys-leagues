import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

export const runtime = "nodejs"
const RPCS = new Set(["set_historical_match_standing_identity", "save_historical_stroke_pairing_review", "commit_historical_match_preview", "remember_verified_player_alias", "commit_historical_stroke_preview", "set_historical_stroke_standing_identity", "admin_create_player_profile_background", "commit_historical_kwt_preview"])

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  try {
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData()
      const action = String(form.get("action") || "")
      const path = String(form.get("path") || "")
      const client = (await import("@/lib/admin/adminServiceClient")).createAdminServiceClient()
      if (action === "upload") { const file = form.get("file"); if (!(file instanceof File)) return NextResponse.json({ error: "A file is required." }, { status: 400 }); const result = await client.storage.from("profile-backgrounds").upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false }); if (result.error) throw result.error }
      else if (action === "remove") { const result = await client.storage.from("profile-backgrounds").remove([path]); if (result.error) throw result.error }
      else return NextResponse.json({ error: "Unknown recovery storage action." }, { status: 400 })
      return NextResponse.json({ data: true }, { headers: { "Cache-Control": "no-store" } })
    }
    const body = await request.json() as Record<string, unknown>
    if (body.action === "read") {
      const allowed = new Set(["historical_match_imports", "historical_match_standings", "historical_stroke_course_appearances", "historical_stroke_imports", "historical_stroke_opponent_assignments", "historical_stroke_standings"])
      const table = String(body.table || "")
      if (!allowed.has(table)) return NextResponse.json({ error: "That recovery table is not in the approved admin contract." }, { status: 400 })
      const querySpec = (body.query || {}) as Record<string, unknown>
      const client = (await import("@/lib/admin/adminServiceClient")).createAdminServiceClient()
      let query = client.from(table).select(String(querySpec.select || "*"), querySpec.options as never)
      for (const [column, value] of Object.entries((querySpec.eq || {}) as Record<string, unknown>)) query = query.eq(column, value)
      for (const [column, value] of Object.entries((querySpec.in || {}) as Record<string, unknown>)) query = query.in(column, value as unknown[])
      const order = querySpec.order as { column?: string; options?: { ascending?: boolean } } | undefined
      if (order?.column) query = query.order(order.column, order.options)
      const result = querySpec.single ? await query.maybeSingle() : await query
      if (result.error) throw result.error
      return NextResponse.json({ data: result.data }, { headers: { "Cache-Control": "no-store" } })
    }
    const name = String(body.name || "")
    if (!RPCS.has(name)) return NextResponse.json({ error: "That recovery RPC is not in the approved admin contract." }, { status: 400 })
    const result = await authorization.supabase.rpc(name, (body.args || {}) as Record<string, unknown>)
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
    return NextResponse.json({ data: result.data }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Recovery admin request failed." }, { status: 400 })
  }
}
