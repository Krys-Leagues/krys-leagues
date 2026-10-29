export type AdminPermissions = { siteAdmin: boolean; soloAdmin: boolean }
export type AdminGateDecision = "login" | "allow" | "deny" | "failure"

export function decideAdminGate(input: {
  pathname: string
  authenticated: boolean
  permissions: AdminPermissions | null
  resolutionFailed?: boolean
}): AdminGateDecision {
  if (!input.authenticated) return "login"
  if (input.resolutionFailed || !input.permissions) return "failure"
  if (input.permissions.siteAdmin) return "allow"
  if (input.permissions.soloAdmin && (input.pathname === "/admin/solo" || input.pathname.startsWith("/admin/solo/"))) return "allow"
  return "deny"
}
