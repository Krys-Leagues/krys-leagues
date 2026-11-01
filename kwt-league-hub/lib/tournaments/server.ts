import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export function trustedTournamentClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Missing trusted Supabase server configuration")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export const FIVE_FOUR_THREE_TWO_ONE_TEMPLATE = {
  name: "5, 4, 3, 2, 1",
  description: "Single elimination. Hole-in-one 5, Condor 4, Albatross 3, Eagle 2, Birdie 1. Most points wins.",
  bracketSize: 32 as const,
  rules: {
    scoring: { hole_in_one: 5, condor: 4, albatross: 3, eagle: 2, birdie: 1, winner: "most_points" },
    tiebreaker: { course: "Forgotten Fairyland", policy: "approved_event_rules" },
  },
}

export function isMissingTournamentSchema(error: { code?: string | null; message?: string | null } | null | undefined) {
  return Boolean(error && (error.code === "42P01" || error.code === "42883" || error.code === "PGRST202" || error.code === "PGRST205" || /does not exist|could not find the function|schema cache/i.test(error.message || "")))
}
