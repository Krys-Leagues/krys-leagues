import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * The protected tournament read model is server-only. Keeping the trusted key
 * here prevents Admin pages from exposing a service-role credential to the
 * browser; client-side writes still use the authenticated RPC route.
 */
export function trustedTournamentClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Missing trusted Supabase server configuration")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
