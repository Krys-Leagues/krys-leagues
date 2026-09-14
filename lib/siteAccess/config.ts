import "server-only"

import { parseSiteAccessMode, type SiteAccessMode } from "@/lib/siteAccess/core"
import type { SupabaseClient } from "@supabase/supabase-js"

export function getSiteAccessMode(): SiteAccessMode {
  return parseSiteAccessMode(process.env.SITE_ACCESS_MODE)
}

type SiteAccessModeClient = Pick<SupabaseClient, "rpc">

/**
 * Resolve the active site gate from the live, admin-controlled database row.
 * The environment variable remains a compatibility fallback if the runtime
 * RPC is unavailable, preserving the private-by-default failure behavior.
 */
export async function resolveSiteAccessMode(client: SiteAccessModeClient): Promise<SiteAccessMode> {
  const { data, error } = await client.rpc("get_site_access_mode")

  if (!error && (data === "public" || data === "prelaunch")) return data

  if (error) {
    console.error("Runtime site access mode resolution failed", {
      code: error.code,
      message: error.message,
    })
  }

  return process.env.SITE_ACCESS_MODE ? getSiteAccessMode() : "prelaunch"
}
