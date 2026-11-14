import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

type ResultBody = {
  action?: unknown
  tournamentId?: unknown
  matchId?: unknown
  winnerPlayerId?: unknown
  advancingPlayerId?: unknown
  scoreLabel?: unknown
  evidenceReference?: unknown
  idempotencyKey?: unknown
  reason?: unknown
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  let body: ResultBody
  try {
    body = (await request.json()) as ResultBody
  } catch {
    return Response.json({ error: "A valid JSON request is required." }, { status: 400 })
  }

  const action = textValue(body.action)
  const matchId = textValue(body.matchId)
  if (!matchId || !["record_result", "force_advance"].includes(action)) {
    return Response.json({ error: "A supported tournament action and match are required." }, { status: 400 })
  }

  const rpc = action === "record_result"
    ? authorization.supabase.rpc("admin_record_tournament_match_result", {
        p_match_id: matchId,
        p_winner_player_id: textValue(body.winnerPlayerId),
        p_score_label: textValue(body.scoreLabel),
        p_evidence_reference: textValue(body.evidenceReference),
        p_idempotency_key: textValue(body.idempotencyKey),
      })
    : authorization.supabase.rpc("admin_force_tournament_advance", {
        p_tournament_id: textValue(body.tournamentId),
        p_match_id: matchId,
        p_advancing_player_id: textValue(body.advancingPlayerId),
        p_reason: textValue(body.reason),
      })

  const { data, error } = await rpc
  if (error) {
    const status = error.code === "42501" ? 403 : 400
    return Response.json({ error: error.message }, { status, headers: { "Cache-Control": "no-store" } })
  }

  return Response.json({ result: data }, { headers: { "Cache-Control": "no-store" } })
}
