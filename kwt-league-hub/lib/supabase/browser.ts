import { createBrowserClient } from "@supabase/ssr"

export function createBrowserSupabaseClient() {
  // Keep client-component module evaluation build-safe when local Preview
  // variables are intentionally unavailable. Configured deployments still
  // use the authoritative Supabase URL and publishable key.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kwt-build-placeholder.invalid"
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "kwt-build-placeholder"
  return createBrowserClient(
    url,
    key,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // The dedicated callback page exchanges each PKCE code exactly once.
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    }
  )
}
