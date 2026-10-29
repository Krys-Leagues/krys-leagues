import { createServerSupabaseClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const noStoreHeaders = { "Cache-Control": "no-store" }

async function getAuthorizedClient() {
  const supabase = await createServerSupabaseClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData.user) {
    return { supabase, response: Response.json({ error: "authentication_required" }, { status: 401, headers: noStoreHeaders }) }
  }

  const { data: siteAdmin, error: authorizationError } = await supabase.rpc("is_current_user_site_admin")
  if (authorizationError) {
    return { supabase, response: Response.json({ error: "authorization_unavailable" }, { status: 503, headers: noStoreHeaders }) }
  }

  if (!siteAdmin) {
    return { supabase, response: Response.json({ error: "administrator_authorization_required" }, { status: 403, headers: noStoreHeaders }) }
  }

  return { supabase, response: null }
}

export async function GET() {
  const { supabase, response } = await getAuthorizedClient()
  if (response) return response

  const { data, error } = await supabase.rpc("get_site_access_state")
  if (error) {
    console.error("Site access state lookup failed", { code: error.code })
    return Response.json({ error: "site_access_state_unavailable" }, { status: 503, headers: noStoreHeaders })
  }

  const state = Array.isArray(data) ? data[0] : data
  return Response.json(state ?? null, { status: 200, headers: noStoreHeaders })
}

export async function POST(request: Request) {
  const { supabase, response } = await getAuthorizedClient()
  if (response) return response

  let body: { mode?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400, headers: noStoreHeaders })
  }

  const mode = body.mode
  if (mode !== "public" && mode !== "prelaunch") {
    return Response.json({ error: "invalid_site_access_mode" }, { status: 400, headers: noStoreHeaders })
  }

  const { data, error } = await supabase.rpc("set_site_access_mode", { p_new_mode: mode })
  if (error) {
    console.error("Site access mode update failed", { code: error.code })
    const status = error.code === "42501" ? 403 : error.code === "55000" ? 503 : 500
    return Response.json({ error: "site_access_mode_update_failed" }, { status, headers: noStoreHeaders })
  }

  const result = Array.isArray(data) ? data[0] : data
  return Response.json(result ?? null, { status: 200, headers: noStoreHeaders })
}
