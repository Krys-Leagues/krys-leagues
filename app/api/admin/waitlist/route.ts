import "server-only"

import { createClient } from "@supabase/supabase-js"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Waitlist admin server access is not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET() {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  try {
    const result = await serviceClient().from("player_waitlist").select("*")
      .in("status", ["waiting", "pending"]).order("created_at", { ascending: false })
    if (result.error) return json({ error: result.error.message }, 503)
    return json({ data: result.data || [] })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Waitlist could not be loaded." }, 503)
  }
}

export async function DELETE(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  try {
    const body = await request.json() as { id?: string }
    if (!body.id) return json({ error: "id is required." }, 400)
    const result = await serviceClient().from("player_waitlist").delete().eq("id", body.id)
    if (result.error) return json({ error: result.error.message }, 503)
    return json({ data: { ok: true } })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Waitlist entry could not be removed." }, 503)
  }
}
