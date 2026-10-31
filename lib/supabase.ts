import { createBrowserSupabaseClient } from "@/lib/supabase/browser"

// Stable compatibility export for existing client components. The underlying
// browser client now stores the same PKCE session in cookies so server-side
// authorization can verify it on subsequent requests.
export const supabase = createBrowserSupabaseClient()
