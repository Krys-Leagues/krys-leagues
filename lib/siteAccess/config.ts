import "server-only"

import { parseSiteAccessMode, type SiteAccessMode } from "@/lib/siteAccess/core"

export function getSiteAccessMode(): SiteAccessMode {
  return parseSiteAccessMode(process.env.SITE_ACCESS_MODE)
}
