import "server-only"

import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { isMissingTournamentSchema, trustedTournamentClient } from "@/lib/tournaments/server"
import { renderPersonalizedTrophy, type TrophyPlacement } from "@/lib/tournaments/trophy"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const TROPHY_BUCKET = "tournament-trophies"
const MAX_TROPHY_BYTES = 8 * 1024 * 1024
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

function errorResponse(error: unknown, status = 503) {
  const detail = error as { code?: string; message?: string } | null
  return NextResponse.json({ error: isMissingTournamentSchema(detail) ? "Tournament Builder schema is not installed in this environment." : error instanceof Error ? error.message : "Trophy operation failed." }, { status })
}

async function verifiedWinner(client: ReturnType<typeof trustedTournamentClient>, tournamentId: string, submittedName: string) {
  const tournamentResult = await client.from("tournaments").select("id,name,status,bracket_size").eq("id", tournamentId).maybeSingle()
  if (tournamentResult.error) throw tournamentResult.error
  if (!tournamentResult.data) throw new Error("Tournament was not found")
  if (tournamentResult.data.status !== "completed") throw new Error("A trophy can only be generated after the tournament is completed")

  const finalRound = Math.log2(Number(tournamentResult.data.bracket_size))
  const finalResult = await client.from("tournament_matches").select("id,round_number,match_number,status,winner_player_id").eq("tournament_id", tournamentId).eq("round_number", finalRound).eq("match_number", 1).maybeSingle()
  if (finalResult.error) throw finalResult.error
  if (!finalResult.data || finalResult.data.status !== "completed" || !finalResult.data.winner_player_id) throw new Error("The final winner is not verified")

  const canonicalResult = await client.rpc("resolve_canonical_player_id", { p_player_id: finalResult.data.winner_player_id })
  if (canonicalResult.error) throw canonicalResult.error
  const canonicalId = typeof canonicalResult.data === "string" ? canonicalResult.data : finalResult.data.winner_player_id
  const playerResult = await client.from("players").select("id,screen_name,active,status").eq("id", canonicalId).maybeSingle()
  if (playerResult.error) throw playerResult.error
  if (!playerResult.data || playerResult.data.active !== true || ["retired", "merged", "archived"].includes(String(playerResult.data.status || "").toLowerCase())) throw new Error("The verified winner is not an active canonical player")
  if (submittedName && submittedName.trim() !== playerResult.data.screen_name) throw new Error("The supplied winner name does not match the verified canonical screen name")
  return { tournament: tournamentResult.data, finalMatchId: finalResult.data.id, winnerId: canonicalId, winnerName: playerResult.data.screen_name }
}

function placementFromForm(form: FormData): TrophyPlacement {
  return {
    x: Number(form.get("x") || 50),
    y: Number(form.get("y") || 80),
    fontSize: Number(form.get("fontSize") || 32),
    color: String(form.get("color") || "#ffffff"),
    align: (String(form.get("align") || "center") as TrophyPlacement["align"]),
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const client = trustedTournamentClient()

  if (request.headers.get("content-type")?.includes("application/json")) {
    const body = await request.json().catch(() => null) as { action?: unknown; awardId?: unknown } | null
    if (body?.action !== "approve" || typeof body.awardId !== "string" || !body.awardId.trim()) return NextResponse.json({ error: "An award approval action and award ID are required." }, { status: 400 })
    try {
      const existing = await client.from("tournament_awards").select("id,tournament_id,status").eq("id", body.awardId).maybeSingle()
      if (existing.error) throw existing.error
      if (!existing.data) return NextResponse.json({ error: "Trophy award was not found." }, { status: 404 })
      if (existing.data.status !== "pending") return NextResponse.json({ error: "This trophy award has already been reviewed." }, { status: 409 })
      const updated = await client.from("tournament_awards").update({ status: "approved", approved_by: authorization.user.id }).eq("id", existing.data.id).eq("status", "pending").select("id,tournament_id,winner_player_id,personalized_storage_path,status,approved_by").single()
      if (updated.error) throw updated.error
      return NextResponse.json({ award: updated.data })
    } catch (error) {
      return errorResponse(error)
    }
  }

  const form = await request.formData().catch(() => null)
  const tournamentId = String(form?.get("tournamentId") || "").trim()
  const submittedName = String(form?.get("winnerName") || "").trim()
  const mode = String(form?.get("mode") || "save")
  const file = form?.get("trophy")
  if (!form || !tournamentId || !(file instanceof File)) return NextResponse.json({ error: "Tournament and original trophy image are required." }, { status: 400 })
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: "Use a JPG, PNG, or WebP trophy image." }, { status: 400 })
  if (file.size <= 0 || file.size > MAX_TROPHY_BYTES) return NextResponse.json({ error: "Trophy image must be between 1 byte and 8 MB." }, { status: 400 })

  try {
    const winner = await verifiedWinner(client, tournamentId, submittedName)
    const originalBytes = new Uint8Array(await file.arrayBuffer())
    const rendered = await renderPersonalizedTrophy(originalBytes, winner.winnerName, placementFromForm(form))
    if (mode === "preview") {
      return NextResponse.json({ preview: `data:image/png;base64,${Buffer.from(rendered.bytes).toString("base64")}`, winnerName: winner.winnerName, width: rendered.width, height: rendered.height, placement: rendered.placement })
    }

    const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "png"
    const basePath = `${tournamentId}/${crypto.randomUUID()}`
    const originalPath = `${basePath}/original.${extension}`
    const personalizedPath = `${basePath}/personalized.png`
    const originalUpload = await client.storage.from(TROPHY_BUCKET).upload(originalPath, originalBytes, { contentType: file.type, cacheControl: "31536000", upsert: false })
    if (originalUpload.error) throw originalUpload.error
    const personalizedUpload = await client.storage.from(TROPHY_BUCKET).upload(personalizedPath, rendered.bytes, { contentType: "image/png", cacheControl: "31536000", upsert: false })
    if (personalizedUpload.error) {
      await client.storage.from(TROPHY_BUCKET).remove([originalPath])
      throw personalizedUpload.error
    }

    const existingAward = await client.from("tournament_awards").select("id,status").eq("tournament_id", tournamentId).eq("winner_player_id", winner.winnerId).maybeSingle()
    if (existingAward.error) throw existingAward.error
    if (existingAward.data && ["approved", "awarded"].includes(existingAward.data.status)) throw new Error("An approved trophy already exists for this verified winner")
    const asset = await client.from("tournament_trophy_assets").insert({ tournament_id: tournamentId, name: `${winner.winnerName} trophy original`, storage_path: originalPath, personalization: { originalPath, personalizedPath, winnerName: winner.winnerName, placement: rendered.placement, width: rendered.width, height: rendered.height }, created_by: authorization.user.id }).select("id,storage_path,personalization").single()
    if (asset.error) throw asset.error
    const award = existingAward.data
      ? await client.from("tournament_awards").update({ trophy_asset_id: asset.data.id, personalized_storage_path: personalizedPath, status: "pending", approved_by: null }).eq("id", existingAward.data.id).select("id,tournament_id,winner_player_id,personalized_storage_path,status").single()
      : await client.from("tournament_awards").insert({ tournament_id: tournamentId, winner_player_id: winner.winnerId, trophy_asset_id: asset.data.id, personalized_storage_path: personalizedPath, status: "pending" }).select("id,tournament_id,winner_player_id,personalized_storage_path,status").single()
    if (award.error) throw award.error
    const signed = await client.storage.from(TROPHY_BUCKET).createSignedUrl(personalizedPath, 3600)
    if (signed.error) throw signed.error
    return NextResponse.json({ trophy: asset.data, award: award.data, winnerName: winner.winnerName, downloadUrl: signed.data.signedUrl }, { status: 201 })
  } catch (error) {
    return errorResponse(error, error instanceof Error && /already exists|not verified|not an active|does not match|only be generated/.test(error.message) ? 409 : 503)
  }
}

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const awardId = new URL(request.url).searchParams.get("awardId")?.trim()
  if (!awardId) return NextResponse.json({ error: "Award ID is required." }, { status: 400 })
  try {
    const client = trustedTournamentClient()
    const award = await client.from("tournament_awards").select("personalized_storage_path,status").eq("id", awardId).maybeSingle()
    if (award.error) throw award.error
    if (!award.data || !["approved", "awarded"].includes(award.data.status) || !award.data.personalized_storage_path) return NextResponse.json({ error: "This trophy is not approved for download." }, { status: 403 })
    const signed = await client.storage.from(TROPHY_BUCKET).createSignedUrl(award.data.personalized_storage_path, 3600)
    if (signed.error) throw signed.error
    return NextResponse.json({ downloadUrl: signed.data.signedUrl })
  } catch (error) {
    return errorResponse(error)
  }
}
