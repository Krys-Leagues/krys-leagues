import { createHash, randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { createScorecardServiceClient, resolveCanonicalSessionPlayer } from "@/lib/scorecards/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { hasSupportedPlayerAvatarSignature, isSupportedPlayerAvatar, playerAvatarExtension, PLAYER_AVATAR_SUBMISSION_BUCKET } from "@/lib/playerAvatarSubmissions"

export const runtime = "nodejs"

async function ownerContext(playerId: string) {
  const session = await createServerSupabaseClient()
  const userResult = await session.auth.getUser()
  if (userResult.error || !userResult.data.user) return { response: NextResponse.json({ error: "Sign in with Discord to submit an avatar." }, { status: 401 }) }
  const service = createScorecardServiceClient()
  const identity = await resolveCanonicalSessionPlayer(service, userResult.data.user)
  if (identity.status !== "resolved" || identity.playerId !== playerId) return { response: NextResponse.json({ error: "Only the linked owner may manage this avatar submission." }, { status: 403 }) }
  return { service }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const owner = await ownerContext(id)
  if (owner.response) return owner.response
  const result = await owner.service.from("player_avatar_submissions").select("id,status,original_filename,submitted_at,reviewed_at,review_note").eq("player_id", id).order("submitted_at", { ascending: false }).limit(1).maybeSingle()
  if (result.error) return NextResponse.json({ error: "Avatar submissions are not configured in this environment." }, { status: 503, headers: { "Cache-Control": "no-store" } })
  return NextResponse.json({ submission: result.data || null }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const owner = await ownerContext(id)
  if (owner.response) return owner.response
  const form = await request.formData()
  const file = form.get("file")
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image to submit." }, { status: 400 })
  const contentType = file.type.toLowerCase()
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!isSupportedPlayerAvatar(contentType, bytes.byteLength) || !hasSupportedPlayerAvatarSignature(contentType, bytes)) return NextResponse.json({ error: "Use a valid JPEG, PNG, WebP, or GIF image up to 5 MB." }, { status: 400 })
  const submissionId = randomUUID()
  const storagePath = `${id}/${submissionId}.${playerAvatarExtension(contentType)}`
  const existing = await owner.service.from("player_avatar_submissions").select("id,status").eq("player_id", id).eq("status", "PENDING").limit(1)
  if (existing.error) return NextResponse.json({ error: "Avatar submissions are not configured in this environment." }, { status: 503, headers: { "Cache-Control": "no-store" } })
  if (existing.data?.length) return NextResponse.json({ error: "An avatar is already awaiting admin review." }, { status: 409 })
  const reservation = await owner.service.from("player_avatar_submissions").insert({ id: submissionId, player_id: id, storage_bucket: PLAYER_AVATAR_SUBMISSION_BUCKET, storage_path: storagePath, original_filename: file.name.slice(0, 255), content_type: contentType, file_size_bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex"), status: "UPLOADING" }).select("id").single()
  if (reservation.error) return NextResponse.json({ error: "Avatar submission could not be reserved." }, { status: 400 })
  const upload = await owner.service.storage.from(PLAYER_AVATAR_SUBMISSION_BUCKET).upload(storagePath, bytes, { contentType, cacheControl: "3600", upsert: false })
  if (upload.error) {
    await owner.service.from("player_avatar_submissions").update({ status: "REJECTED", review_note: "Upload failed." }).eq("id", submissionId).eq("status", "UPLOADING")
    return NextResponse.json({ error: "Avatar upload failed." }, { status: 400 })
  }
  const complete = await owner.service.from("player_avatar_submissions").update({ status: "PENDING", submitted_at: new Date().toISOString() }).eq("id", submissionId).eq("status", "UPLOADING")
  if (complete.error) return NextResponse.json({ error: "Avatar submission could not be finalized." }, { status: 400 })
  return NextResponse.json({ submissionId, status: "PENDING" }, { status: 201 })
}
