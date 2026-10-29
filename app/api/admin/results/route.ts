import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

type ResultMutationBody = {
  action?: "insert"
  result?: Record<string, unknown>
}

function numberOrNull(value: unknown) {
  return value === null || value === undefined || value === "" ? null : Number(value)
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  let body: ResultMutationBody
  try {
    body = (await request.json()) as ResultMutationBody
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (body.action !== "insert" || !body.result || typeof body.result !== "object") {
    return Response.json({ error: "Unsupported result mutation" }, { status: 400 })
  }

  const row = body.result
  const { data, error } = await authorization.supabase.rpc("admin_insert_result", {
    p_league_type: typeof row.league_type === "string" ? row.league_type : null,
    p_division: typeof row.division === "string" ? row.division : null,
    p_season_number: numberOrNull(row.season_number),
    p_game: typeof row.game === "string" ? row.game : row.game == null ? null : String(row.game),
    p_course: typeof row.course === "string" ? row.course : null,
    p_player1: typeof row.player1 === "string" ? row.player1 : null,
    p_player2: typeof row.player2 === "string" ? row.player2 : null,
    p_player1_id: typeof row.player1_id === "string" ? row.player1_id : null,
    p_player2_id: typeof row.player2_id === "string" ? row.player2_id : null,
    p_result_type: typeof row.result_type === "string" ? row.result_type : "league_result",
    p_player1_score: numberOrNull(row.player1_score),
    p_player2_score: numberOrNull(row.player2_score),
    p_player1_hw: numberOrNull(row.player1_hw),
    p_player2_hw: numberOrNull(row.player2_hw),
    p_player1_points: numberOrNull(row.player1_points),
    p_player2_points: numberOrNull(row.player2_points),
    p_player1_easy_score: numberOrNull(row.player1_easy_score),
    p_player1_hard_score: numberOrNull(row.player1_hard_score),
    p_player2_easy_score: numberOrNull(row.player2_easy_score),
    p_player2_hard_score: numberOrNull(row.player2_hard_score),
    p_winner: typeof row.winner === "string" ? row.winner : null,
    p_is_draw: typeof row.is_draw === "boolean" ? row.is_draw : null,
  })

  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ data }, { headers: { "Cache-Control": "no-store" } })
}
