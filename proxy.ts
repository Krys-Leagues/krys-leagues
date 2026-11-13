import { NextResponse, type NextRequest } from "next/server"
import { decideAdminGate, type AdminPermissions } from "@/lib/adminAccess/core"
import { featureAccessDecision } from "@/lib/featureVisibility/core"
import { getFeatureRoute } from "@/lib/featureVisibility/server"
import { refreshSupabaseSession } from "@/lib/supabase/proxy"
import { getSiteAccessMode } from "@/lib/siteAccess/config"
import { decideSiteAccessGate, safePrelaunchNext, testingAccessRedirect, type CurrentSiteAccess } from "@/lib/siteAccess/core"
import { canonicalRedirectUrl } from "@/lib/canonicalHost"

function withSessionCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie))
  return target
}

export async function proxy(request: NextRequest) {
  const canonicalRedirect = canonicalRedirectUrl(request.url)
  if (canonicalRedirect) return NextResponse.redirect(canonicalRedirect, 308)

  const session = await refreshSupabaseSession(request)
  const mode = getSiteAccessMode()
  const pathname = request.nextUrl.pathname
  if (pathname === "/auth/callback") return session.response
  if (pathname === "/api/auth/admin-authorization") return session.response

  if (pathname === "/access-denied") return session.response

  // The Masters historical board is a presentation-only recovery surface. On Vercel,
  // keep it behind Deployment Protection and expose it only on Preview deployments;
  // production continues through the normal feature-access boundary.
  if (pathname === "/masters/results/preview" && process.env.VERCEL_ENV === "preview") return session.response

  // Tournament Admin authority is instance-scoped and resolved by the scoring
  // module's database policy, so MGA event Admins do not need site-wide access.
  const scoringAdminMatch = /^\/scoring-studio\/([^/]+)\/admin$/.exec(pathname)
  if (/^\/scoring-studio\/[^/]+\/admin-login$/.test(pathname)) return session.response
  if (scoringAdminMatch) {
    const instanceSlug = scoringAdminMatch[1]
    if (!session.user) {
      const loginUrl = new URL(`/scoring-studio/${encodeURIComponent(instanceSlug)}/admin-login`, request.url)
      return withSessionCookies(session.response, NextResponse.redirect(loginUrl))
    }
    const { data: instance, error: instanceError } = await session.supabase
      .from("scoring_studio_instances").select("id").eq("slug", instanceSlug).maybeSingle()
    if (instanceError || !instance) return withSessionCookies(session.response, NextResponse.redirect(new URL("/access-denied?reason=scoring-admin", request.url)))
    const { data: authorized, error } = await session.supabase.rpc("scoring_studio_is_admin", { p_instance_id: instance.id })
    if (error || !authorized) return withSessionCookies(session.response, NextResponse.redirect(new URL("/access-denied?reason=scoring-admin", request.url)))
    return session.response
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (!session.user) {
      if (pathname === "/admin") return session.response
      const loginUrl = new URL("/admin", request.url)
      loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`)
      return withSessionCookies(session.response, NextResponse.redirect(loginUrl))
    }

    let permissions: AdminPermissions | null = null
    let resolutionFailed = false
    const { data: siteAdmin, error: siteAdminError } = await session.supabase.rpc("is_current_user_site_admin")
    if (siteAdminError) {
      resolutionFailed = true
      console.error("Server admin authorization failed", {
        pathname,
        siteAdminCode: siteAdminError?.code,
      })
    } else if (Boolean(siteAdmin)) {
      permissions = { siteAdmin: true, soloAdmin: false }
    } else {
      const { data: soloAdmin, error: soloAdminError } = await session.supabase.rpc("is_current_user_solo_admin")
      if (soloAdminError) {
        resolutionFailed = true
        console.error("Server admin authorization failed", {
          pathname,
        })
      } else {
        permissions = { siteAdmin: false, soloAdmin: Boolean(soloAdmin) }
      }
    }

    const decision = decideAdminGate({ pathname, authenticated: true, permissions, resolutionFailed })
    if (decision === "allow") return session.response
    const denial = new URL("/access-denied", request.url)
    denial.searchParams.set("reason", decision === "failure" ? "admin-unavailable" : "admin")
    return withSessionCookies(session.response, NextResponse.redirect(denial))
  }

  let access: CurrentSiteAccess | null = null
  let resolutionFailed = false
  const feature = getFeatureRoute(pathname)
  const needsAccess = mode === "prelaunch" || Boolean(feature && feature.visibility !== "live")

  if (session.user && needsAccess) {
    const { data, error } = await session.supabase.rpc("get_current_site_access")
    if (error) {
      resolutionFailed = true
      console.error("Prelaunch site access resolution failed", { pathname, code: error.code, message: error.message })
    } else {
      access = (Array.isArray(data) ? data[0] : data) as CurrentSiteAccess | null
    }
  }

  if (mode === "prelaunch") {
    const decision = decideSiteAccessGate({ mode, pathname, access, resolutionFailed })
    if (decision === "continue") {
      const destination = safePrelaunchNext(request.nextUrl.searchParams.get("next"))
      return withSessionCookies(session.response, NextResponse.redirect(new URL(destination, request.url)))
    }
    if (decision === "boundary") {
      if (pathname === "/testing-access") return session.response

      if (pathname.startsWith("/api/")) {
        const status = resolutionFailed ? 503 : session.user ? 403 : 401
        return withSessionCookies(session.response, NextResponse.json(
          { error: resolutionFailed ? "site_access_unavailable" : "private_testing_access_required" },
          { status, headers: { "Cache-Control": "no-store" } },
        ))
      }

      const original = `${request.nextUrl.pathname}${request.nextUrl.search}`
      return withSessionCookies(session.response, NextResponse.redirect(new URL(testingAccessRedirect(original), request.url)))
    }
  } else if (pathname === "/testing-access") {
    return session.response
  }

  if (feature) {
    const decision = featureAccessDecision({ siteMode: mode, visibility: feature.visibility, access, resolutionFailed })
    if (decision === "resolution-failed") {
      const denial = new URL("/access-denied", request.url)
      denial.searchParams.set("reason", "unavailable")
      return withSessionCookies(session.response, NextResponse.redirect(denial))
    }
    if (decision === "deny") {
      return withSessionCookies(session.response, NextResponse.redirect(new URL("/access-denied", request.url)))
    }
  }

  return session.response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|mp4|mov|css|js|woff|woff2|txt|xml|webmanifest)$).*)",
  ],
}
