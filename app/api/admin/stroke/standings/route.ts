import { createClient } from "@supabase/supabase-js"
import { createServerSupabaseClient } from "@/lib/supabase/server"

type StandingRow = {
  player_id: string
  points: number
  wins: number
  losses: number
  ties: number
  strokes: number
  rank: number
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Stroke admin server access is not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET(request: Request) {
  const sessionClient = await createServerSupabaseClient()
  const { data: userData, error: userError } = await sessionClient.auth.getUser()
  if (userError || !userData.user) return Response.json({ error: "Authentication required." }, { status: 401 })

  const { data: isAdmin, error: adminError } = await sessionClient.rpc("is_current_user_site_admin")
  if (adminError) return Response.json({ error: "Admin authorization could not be checked." }, { status: 503 })
  if (!isAdmin) return Response.json({ error: "Site administrator access is required." }, { status: 403 })

  const params = new URL(request.url).searchParams
  const seasonId = params.get("seasonId")?.trim()
  const divisionNumber = Number(params.get("divisionNumber"))
  if (!seasonId || !Number.isInteger(divisionNumber) || divisionNumber < 1) {
    return Response.json({ error: "A valid Stroke season and division are required." }, { status: 400 })
  }

  try {
    const service = serviceClient()
    const { data: season, error: seasonError } = await service
      .from("seasons")
      .select("id, season_number, league_type")
      .eq("id", seasonId)
      .maybeSingle()
    if (seasonError) throw seasonError
    if (!season || season.league_type !== "stroke") return Response.json({ error: "Managed Stroke season was not found." }, { status: 404 })

    const { data, error } = await service
      .from("season_standings")
      .select("player_id, points, wins, losses, ties, strokes, rank")
      .eq("league_type", "stroke")
      .eq("division", `Stroke D${divisionNumber}`)
      .eq("season_number", season.season_number)
      .order("rank", { ascending: true })
    if (error) throw error

    const rows = (data || []) as StandingRow[]
    const standings = await Promise.all(rows.map(async (row) => {
      const identity = await service.rpc("get_public_player_canonical_identity", { p_player_id: row.player_id })
      if (identity.error) throw identity.error
      const resolved = Array.isArray(identity.data) ? identity.data[0] : identity.data
      return {
        ...row,
        player_screen_name: typeof resolved?.canonical_screen_name === "string" ? resolved.canonical_screen_name : "Unknown Player",
      }
    }))

    return Response.json({ standings }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    console.error("Stroke admin standings load failed", error instanceof Error ? error.message : "unknown error")
    return Response.json({ error: "Stroke standings could not be loaded." }, { status: 500 })
  }
}
