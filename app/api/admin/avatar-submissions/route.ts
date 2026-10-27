import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createScorecardServiceClient } from "@/lib/scorecards/server"
import { PLAYER_AVATAR_SUBMISSION_BUCKET } from "@/lib/playerAvatarSubmissions"

export const runtime = "nodejs"

export async function GET() {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const service = createScorecardServiceClient()
  const submissions = await service.from("player_avatar_submissions").select("id,player_id,storage_bucket,storage_path,original_filename,content_type,file_size_bytes,status,submitted_at,reviewed_at,review_note").order("submitted_at", { ascending: false })
  if (submissions.error) return Response.json({ error: "Avatar submissions are not configured in this environment." }, { status: 503, headers: { "Cache-Control": "no-store" } })
  const playerIds = [...new Set((submissions.data || []).map(row => String(row.player_id)))]
  const players = playerIds.length ? await service.from("players").select("id,screen_name").in("id", playerIds) : { data: [], error: null }
  const names = new Map((players.data || []).map(player => [String(player.id), String(player.screen_name)]))
  const rows = await Promise.all((submissions.data || []).map(async row => {
    const signed = row.status === "PENDING" ? await service.storage.from(PLAYER_AVATAR_SUBMISSION_BUCKET).createSignedUrl(String(row.storage_path), 600) : { data: null }
    return { ...row, screen_name: names.get(String(row.player_id)) || "Unknown player", preview_url: signed.data?.signedUrl || null }
  }))
  return Response.json({ submissions: rows }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const body = await request.json().catch(() => null) as { submissionId?: string; decision?: string; note?: string } | null
  if (!body?.submissionId || !["APPROVED", "REJECTED"].includes(body.decision || "")) return Response.json({ error: "Choose a submission and APPROVED or REJECTED decision." }, { status: 400 })
  const service = createScorecardServiceClient()
  const current = await service.from("player_avatar_submissions").select("id,player_id,storage_path,content_type,status").eq("id", body.submissionId).eq("status", "PENDING").maybeSingle()
  if (current.error) return Response.json({ error: "Avatar submissions are not configured in this environment." }, { status: 503 })
  if (!current.data) return Response.json({ error: "Submission is no longer pending." }, { status: 409 })
  if (body.decision === "APPROVED") {
    const download = await service.storage.from(PLAYER_AVATAR_SUBMISSION_BUCKET).download(String(current.data.storage_path))
    if (download.error || !download.data) return Response.json({ error: "Approved avatar could not be read from private storage." }, { status: 400 })
    const extension = String(current.data.content_type).split("/")[1] === "jpeg" ? "jpg" : String(current.data.content_type).split("/")[1]
    const publicPath = `${current.data.player_id}/avatar-${Date.now()}.${extension}`
    const upload = await service.storage.from("player-avatars").upload(publicPath, download.data, { contentType: String(current.data.content_type), cacheControl: "3600", upsert: false })
    if (upload.error) return Response.json({ error: "Approved avatar could not be published to the existing avatar path." }, { status: 400 })
    const playerUpdate = await service.from("players").update({ avatar_path: publicPath }).eq("id", current.data.player_id)
    if (playerUpdate.error) { await service.storage.from("player-avatars").remove([publicPath]); return Response.json({ error: "Canonical player avatar could not be updated." }, { status: 400 }) }
  }
  const update = await service.from("player_avatar_submissions").update({ status: body.decision, reviewed_at: new Date().toISOString(), reviewed_by: authorization.user.id, review_note: body.note?.slice(0, 1000) || null }).eq("id", body.submissionId).eq("status", "PENDING")
  if (update.error) return Response.json({ error: "Avatar review could not be recorded." }, { status: 400 })
  return Response.json({ submissionId: body.submissionId, status: body.decision })
}
