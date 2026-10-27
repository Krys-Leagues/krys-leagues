import { NextResponse } from "next/server"
import { getCourseChallengeIdentity, createCourseChallengesServiceClient } from "@/lib/courseChallenges/server"
import { validateScorecard, scoreTournamentCard } from "@/lib/tournaments/workflow"

export const runtime = "nodejs"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const identity = await getCourseChallengeIdentity()
  if (!identity) return NextResponse.json({ error: "Sign in with a linked canonical player before submitting a scorecard." }, { status: 401 })
  const { id } = await context.params
  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: "A scorecard submission is required." }, { status: 400 })
  const file = form.get("evidence")
  const scores = String(form.get("scores") || "").split(",").map(Number)
  const pars = String(form.get("pars") || "").split(",").map(Number)
  const idempotencyKey = String(form.get("idempotencyKey") || crypto.randomUUID())
  if (!(file instanceof File) || !file.type.startsWith("image/")) return NextResponse.json({ error: "Upload the original scorecard image as evidence." }, { status: 400 })
  const matchId = String(form.get("matchId") || "")
  if (!matchId) return NextResponse.json({ error: "A match is required for this scorecard." }, { status: 400 })
  let filePath = ""
  try { validateScorecard(scores); const result = scoreTournamentCard(scores, pars, { ...(form.get("rules") ? JSON.parse(String(form.get("rules"))) : {}) }); const service = createCourseChallengesServiceClient(); const match = await service.from("tournament_matches").select("id,tournament_id,player_a_id,player_b_id,status").eq("id", matchId).eq("tournament_id", id).maybeSingle(); if (match.error || !match.data || ![match.data.player_a_id, match.data.player_b_id].includes(identity.playerId)) throw new Error("You may only submit a scorecard for your own active match"); if (match.data.status === "completed") throw new Error("Completed matches cannot accept new scorecards"); filePath = `${id}/${identity.playerId}/${idempotencyKey}.${file.type.split("/")[1] || "png"}`; const upload = await service.storage.from("tournament-scorecards").upload(filePath, file, { contentType: file.type, upsert: false }); if (upload.error) throw upload.error; const inserted = await service.from("tournament_scorecard_submissions").insert({ tournament_id: id, match_id: matchId, player_id: identity.playerId, evidence_path: filePath, score_payload: { scores, pars, total: result.total, points: result.points }, submitted_by: identity.user.id, idempotency_key: idempotencyKey }).select("id,status").single(); if (inserted.error) { await service.storage.from("tournament-scorecards").remove([filePath]); throw inserted.error } return NextResponse.json({ submission: inserted.data, calculation: result }, { status: 201 }) } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Scorecard submission failed." }, { status: 400 }) }
}
