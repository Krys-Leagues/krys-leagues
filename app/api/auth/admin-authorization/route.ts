import { createClient } from "@supabase/supabase-js"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization") || ""

  // The OAuth callback still calls this endpoint with a bearer token before
  // the browser session cookie is available. The admin layout uses the
  // cookie-backed server path so its access check never performs a
  // browser-side Supabase data query.
  if (!authorization) {
    const siteAdminAuthorization = await authorizeSiteAdminMutation()

    if (siteAdminAuthorization.authorized) {
      return Response.json(
        { authorized: true, siteAdmin: true, soloAdmin: false, reason: null },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      )
    }

    if (siteAdminAuthorization.response.status !== 403) {
      return siteAdminAuthorization.response
    }

    const supabase = await createServerSupabaseClient()
    const { data: user, error: userError } = await supabase.auth.getUser()
    if (userError || !user.user) return siteAdminAuthorization.response

    const { data: soloAuthorized, error: soloAuthorizationError } = await supabase.rpc(
      "is_current_user_solo_admin",
    )

    if (soloAuthorizationError) {
      return Response.json(
        { authorized: false, reason: "authorization_check_failed" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      )
    }

    return Response.json(
      {
        authorized: Boolean(soloAuthorized),
        siteAdmin: false,
        soloAdmin: Boolean(soloAuthorized),
        reason: soloAuthorized ? null : "admin_access_denied",
      },
      {
        status: soloAuthorized ? 200 : 403,
        headers: { "Cache-Control": "no-store" },
      },
    )
  }

  const [scheme, accessToken] = authorization.split(" ")

  if (scheme?.toLowerCase() !== "bearer" || !accessToken) {
    return Response.json(
      { authorized: false, reason: "authentication_required" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    )
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    }
  )
  const { data, error } = await supabase.auth.getUser(accessToken)

  if (error || !data.user) {
    return Response.json(
      { authorized: false, reason: "invalid_session" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    )
  }

  const { data: authorized, error: authorizationError } = await supabase.rpc(
    "is_current_user_site_admin"
  )

  if (authorizationError) {
    return Response.json(
      { authorized: false, reason: "authorization_check_failed" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    )
  }

  // A site admin is already authorized for every admin route. Do not make
  // that decision depend on the optional Solo-admin RPC being available.
  if (authorized) {
    return Response.json(
      {
        authorized: true,
        siteAdmin: true,
        soloAdmin: false,
        reason: null,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    )
  }

  const { data: soloAuthorized, error: soloAuthorizationError } = await supabase.rpc(
    "is_current_user_solo_admin"
  )

  if (soloAuthorizationError) {
    return Response.json(
      { authorized: false, reason: "authorization_check_failed" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    )
  }

  const hasAdminAccess = Boolean(authorized || soloAuthorized)

  return Response.json(
    {
      authorized: hasAdminAccess,
      siteAdmin: Boolean(authorized),
      soloAdmin: Boolean(soloAuthorized),
      reason: hasAdminAccess ? null : "admin_access_denied",
    },
    {
      status: hasAdminAccess ? 200 : 403,
      headers: { "Cache-Control": "no-store" },
    }
  )
}
