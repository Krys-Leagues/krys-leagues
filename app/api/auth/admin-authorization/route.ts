import { createClient } from "@supabase/supabase-js"

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization") || ""
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

  return Response.json(
    {
      authorized,
      reason: authorized ? null : "admin_access_denied",
    },
    {
      status: authorized ? 200 : 403,
      headers: { "Cache-Control": "no-store" },
    }
  )
}
