import "server-only"

import { createClient } from "@supabase/supabase-js"

export const ALL_TIME_SCORECARD_BUCKET = "all-time-scorecards"

export function createAllTimeScorecardServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("All-Time scorecard storage is not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export function isMissingScorecardSchema(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "42P01"
    || /all_time_scorecard_attachments|all-time-scorecards|bucket not found/i.test(error?.message ?? "")
}
