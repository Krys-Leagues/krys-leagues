export type SiteAccessMode = "public" | "prelaunch"

export type CurrentSiteAccess = {
  authenticated: boolean
  canonical_player_id: string | null
  approved_tester: boolean
  site_admin: boolean
}

const MAX_NEXT_LENGTH = 2048

export function parseSiteAccessMode(value: string | null | undefined): SiteAccessMode {
  return value?.trim().toLowerCase() === "prelaunch" ? "prelaunch" : "public"
}

export function safePrelaunchNext(value: string | null | undefined) {
  if (!value || value.length > MAX_NEXT_LENGTH) return "/"
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/"
  if (/[\u0000-\u001f\u007f]/.test(value)) return "/"

  let decoded = value
  for (let pass = 0; pass < 3; pass += 1) {
    try {
      const next = decodeURIComponent(decoded)
      if (next === decoded) break
      decoded = next
    } catch {
      return "/"
    }
  }

  if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.includes("\\")) return "/"
  if (/^[a-z][a-z0-9+.-]*:/i.test(decoded.slice(1))) return "/"

  const parsed = new URL(value, "https://krys-leagues.internal")
  if (parsed.origin !== "https://krys-leagues.internal") return "/"
  if (parsed.pathname === "/auth/callback" || parsed.pathname === "/testing-access") return "/"
  if (parsed.pathname.startsWith("/api/")) return "/"
  return `${parsed.pathname}${parsed.search}${parsed.hash}`
}

export function isPrelaunchEntryPath(pathname: string) {
  return pathname === "/testing-access" || pathname === "/auth/callback"
}

export function siteAccessAllowed(access: CurrentSiteAccess | null) {
  return Boolean(access?.authenticated && (access.approved_tester || access.site_admin))
}

export function testingAccessRedirect(next: string | null | undefined) {
  const safeNext = safePrelaunchNext(next)
  return safeNext === "/" ? "/testing-access" : `/testing-access?next=${encodeURIComponent(safeNext)}`
}

export type SiteAccessGateDecision = "allow" | "boundary" | "continue"

export function decideSiteAccessGate(input: {
  mode: SiteAccessMode
  pathname: string
  access: CurrentSiteAccess | null
  resolutionFailed?: boolean
}): SiteAccessGateDecision {
  if (input.mode === "public") return "allow"
  if (input.pathname === "/auth/callback") return "allow"

  const allowed = !input.resolutionFailed && siteAccessAllowed(input.access)
  if (input.pathname === "/testing-access") return allowed ? "continue" : "boundary"
  return allowed ? "allow" : "boundary"
}
