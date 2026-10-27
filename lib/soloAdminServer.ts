import "server-only"

import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function authorizeSoloAdmin() {
  const supabase = await createServerSupabaseClient()
  const user = await supabase.auth.getUser()
  if (user.error || !user.data.user) return { authorized: false as const, response: NextResponse.json({ error: "Authentication required" }, { status: 401 }) }
  const site = await supabase.rpc("is_current_user_site_admin")
  if (site.error) return { authorized: false as const, response: NextResponse.json({ error: "Authorization check failed" }, { status: 503 }) }
  if (site.data) return { authorized: true as const, supabase, user: user.data.user }
  const solo = await supabase.rpc("is_current_user_solo_admin")
  if (solo.error) return { authorized: false as const, response: NextResponse.json({ error: "Authorization check failed" }, { status: 503 }) }
  if (!solo.data) return { authorized: false as const, response: NextResponse.json({ error: "Solo administrator authorization is required" }, { status: 403 }) }
  return { authorized: true as const, supabase, user: user.data.user }
}
