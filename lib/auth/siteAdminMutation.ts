import "server-only"

import type { SupabaseClient, User } from "@supabase/supabase-js"

import { authorizeSiteAdminWithClient } from "@/lib/auth/siteAdminAuthorizationCore"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export type SiteAdminMutationAuthorization =
  | { authorized: true; supabase: SupabaseClient; user: User }
  | { authorized: false; response: Response }

export async function authorizeSiteAdminMutation(): Promise<SiteAdminMutationAuthorization> {
  const supabase = await createServerSupabaseClient()
  const authorization = await authorizeSiteAdminWithClient(supabase)

  if (!authorization.authorized) return authorization

  return { ...authorization, supabase }
}
