import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { loadVerifiedKwtNetPayload } from "@/lib/kwtNetServer"

export const dynamic = "force-dynamic"

type OperationalRow = {
  season_number: number | null
  week_number: number | null
  division: string | null
  easy_score: number | null
  hard_score: number | null
  total_score: number | null
  overall_placement: number | null
  points: number | null
  status: string | null
}

type Player = { id: string; screen_name: string | null }

export async function GET() {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  const [payload, resultsResponse] = await Promise.all([
    loadVerifiedKwtNetPayload(),
    authorization.supabase
      .from("kwt_operational_results")
      .select("season_number,week_number,player_id,division,easy_score,hard_score,total_score,overall_placement,points,status"),
  ])

  if (resultsResponse.error) {
    return Response.json({
      state: "UNAVAILABLE",
      event: payload.event,
      net: { state: payload.state, rows: payload.rows.length, seasonRows: payload.season.rows.length },
      gross: { state: "UNAVAILABLE", rows: 0 },
      blockers: ["The protected operational-results report could not be read for this administrator."],
    }, { status: 200, headers: { "Cache-Control": "no-store" } })
  }

  const rows = (resultsResponse.data ?? []) as (OperationalRow & { player_id: string | null })[]
  const playerIds = [...new Set(rows.map((row) => row.player_id).filter((id): id is string => Boolean(id)))]
  const playersResponse = playerIds.length
    ? await authorization.supabase.from("players").select("id,screen_name").in("id", playerIds)
    : { data: [], error: null }
  const names = new Map(((playersResponse.data ?? []) as Player[]).map((player) => [player.id, player.screen_name ?? player.id]))
  const current = rows.filter((row) => row.season_number === 15 && row.week_number === 1)
  const byDivision = new Map<string, { players: number; easy: { score: number; name: string } | null; hard: { score: number; name: string } | null }>()
  for (const row of current) {
    const division = row.division ?? "UNASSIGNED"
    const existing = byDivision.get(division) ?? { players: 0, easy: null, hard: null }
    existing.players += 1
    if (row.easy_score !== null && (!existing.easy || row.easy_score < existing.easy.score)) existing.easy = { score: row.easy_score, name: names.get(row.player_id ?? "") ?? "UNKNOWN PLAYER" }
    if (row.hard_score !== null && (!existing.hard || row.hard_score < existing.hard.score)) existing.hard = { score: row.hard_score, name: names.get(row.player_id ?? "") ?? "UNKNOWN PLAYER" }
    byDivision.set(division, existing)
  }

  return Response.json({
    state: payload.state === "AVAILABLE" || current.length ? "AVAILABLE" : "UNAVAILABLE",
    event: payload.event,
    net: { state: payload.state, rows: payload.rows.length, seasonRows: payload.season.rows.length },
    gross: { state: current.length ? "AVAILABLE" : "UNAVAILABLE", rows: current.length, divisions: Object.fromEntries(byDivision) },
    workflow: {
      weekSetup: "PENDING_PROTECTED_SETUP",
      csvImport: "REVIEW_ONLY_UNTIL_AUTHORIZED_STORAGE_CONTRACT",
      finalization: "LOCKED_UNTIL_EXPLICIT_ADMIN_CONFIRMATION",
      aceReporting: "PENDING_HOLE_BY_HOLE_STORAGE",
      historicalWeeks: "NO_VERIFIED_PRODUCTION_ROWS",
    },
    blockers: current.length ? [] : ["No verified Season 15 Week 01 operational result rows are available in Production."],
  }, { headers: { "Cache-Control": "no-store" } })
}
