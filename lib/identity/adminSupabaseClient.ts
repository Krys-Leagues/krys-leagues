import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export function createAdminSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Admin server data access is not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
