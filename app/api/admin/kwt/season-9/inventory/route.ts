import "server-only"

import { createClient } from "@supabase/supabase-js"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import {
  buildExistingKwtHistoryInventory,
  KWT_EXISTING_HISTORY_TABLES,
  type KwtExistingHistoryTableResult,
} from "@/lib/importer/loadKwtExistingHistory"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

function kwtAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("KWT admin server access is not configured.")
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function GET() {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  try {
    const supabase = kwtAdminClient()
    const results = await Promise.all(KWT_EXISTING_HISTORY_TABLES.map(async (table): Promise<KwtExistingHistoryTableResult> => {
      const result = await supabase.from(table).select("*").limit(20000)
      return {
        table,
        data: result.data as unknown[] | null,
        error: result.error?.message ?? null,
      }
    }))

    return json(buildExistingKwtHistoryInventory(results))
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Existing KWT history could not be loaded." }, 503)
  }
}
