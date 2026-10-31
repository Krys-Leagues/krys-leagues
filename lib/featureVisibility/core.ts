import type { CurrentSiteAccess, SiteAccessMode } from "@/lib/siteAccess/core"

export type FeatureVisibility = "private" | "tester" | "live"
export type FeatureRoute = { key: string; path: string; visibility: FeatureVisibility }
export type FeatureAccessDecision = "allow" | "deny" | "site-deny" | "resolution-failed"

export function featureAccessDecision(input: {
  siteMode: SiteAccessMode
  visibility: FeatureVisibility
  access: CurrentSiteAccess | null
  resolutionFailed?: boolean
}): FeatureAccessDecision {
  const { siteMode, visibility, access, resolutionFailed = false } = input
  if (resolutionFailed) return "resolution-failed"
  if (siteMode === "prelaunch" && !access?.site_admin && !access?.approved_tester) return "site-deny"
  if (visibility === "live") return "allow"
  if (visibility === "private") return access?.site_admin ? "allow" : "deny"
  return access?.site_admin || access?.approved_tester ? "allow" : "deny"
}

export function matchesFeatureRoute(pathname: string, routePath: string) {
  if (routePath === "/") return pathname === "/"
  return pathname === routePath || pathname.startsWith(`${routePath}/`)
}
