import type { User } from "@supabase/supabase-js"

export type SiteAdminAuthorizationClient = {
  auth: {
    getUser(): Promise<{
      data: { user: User | null }
      error: unknown
    }>
  }
  rpc(name: "is_current_user_site_admin"): PromiseLike<{
    data: unknown
    error: unknown
  }>
}

function denied(status: 401 | 403 | 503, error: string) {
  return {
    authorized: false as const,
    response: Response.json(
      { authorized: false, error },
      { status, headers: { "Cache-Control": "no-store" } },
    ),
  }
}

export async function authorizeSiteAdminWithClient(client: SiteAdminAuthorizationClient) {
  const { data, error } = await client.auth.getUser()

  if (error || !data.user) return denied(401, "authentication_required")

  const { data: siteAdmin, error: authorizationError } = await client.rpc(
    "is_current_user_site_admin",
  )

  if (authorizationError) return denied(503, "authorization_check_failed")
  if (!siteAdmin) return denied(403, "site_admin_required")

  return { authorized: true as const, user: data.user }
}
