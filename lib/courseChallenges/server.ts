import { createClient, type User } from "@supabase/supabase-js"
import { createServerSupabaseClient } from "@/lib/supabase/server"

type CurrentSiteAccess = {
  canonical_player_id: string | null
  approved_tester: boolean
  site_admin: boolean
}

export type CourseChallengeIdentity = {
  user: User
  playerId: string
  approvedTester: boolean
  siteAdmin: boolean
}

export function createCourseChallengesServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Course Challenges server access is not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function getCourseChallengeIdentity(): Promise<CourseChallengeIdentity | null> {
  const client = await createServerSupabaseClient()
  const { data: userData, error: userError } = await client.auth.getUser()
  if (userError || !userData.user) return null
  const { data: accessData, error: accessError } = await client.rpc("get_current_site_access")
  if (accessError) throw accessError
  const access = (Array.isArray(accessData) ? accessData[0] : accessData) as CurrentSiteAccess | null
  const playerId = access?.canonical_player_id?.trim() || null
  if (!playerId) return null
  return { user: userData.user, playerId, approvedTester: Boolean(access?.approved_tester), siteAdmin: Boolean(access?.site_admin) }
}

export async function requireCourseChallengeAdmin() {
  const client = await createServerSupabaseClient()
  const { data: userData, error: userError } = await client.auth.getUser()
  if (userError || !userData.user) return { response: Response.json({ error: "Authentication required." }, { status: 401 }), user: null }
  const { data: isAdmin, error: adminError } = await client.rpc("is_current_user_site_admin")
  if (adminError) return { response: Response.json({ error: "Admin authorization could not be checked." }, { status: 503 }), user: null }
  if (!isAdmin) return { response: Response.json({ error: "Site administrator access is required." }, { status: 403 }), user: null }
  return { response: null, user: userData.user }
}