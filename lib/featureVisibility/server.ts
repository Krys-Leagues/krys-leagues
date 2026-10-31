import "server-only"

import { matchesFeatureRoute } from "@/lib/featureVisibility/core"
import { FEATURE_ROUTES } from "@/lib/featureVisibility/registry"

const SYSTEM_PATHS = new Set(["/auth/callback", "/testing-access", "/access-denied"])

export function getFeatureRoute(pathname: string) {
  if (SYSTEM_PATHS.has(pathname) || pathname.startsWith("/api/") || pathname.startsWith("/admin")) return null
  // Four Majors deliberately remains controlled by its specialized publication/test-event rules.
  if (pathname === "/majors" || pathname.startsWith("/majors/")) return null

  return FEATURE_ROUTES.find((route) => matchesFeatureRoute(pathname, route.path)) ?? {
    key: "unregistered",
    path: pathname,
    visibility: "private" as const,
  }
}
