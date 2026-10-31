import { NextResponse } from "next/server"

import {
  MAJOR_ROOM_SCORECARD_BUCKET,
  MAJOR_ROOM_SCORECARD_EXTENSIONS,
  isCompleteMastersRoomRoster,
  roomScorecardImageUrl,
  type MajorRoomScorecardContext,
  validMajorRoomScorecardFile,
} from "@/lib/majorRoomScorecard"
import { createScorecardServiceClient } from "@/lib/scorecards/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })

async function authorizeRoom(playDayId: string) {
  if (!UUID.test(playDayId)) return { response: json({ error: "The Masters round reference is invalid." }, 400), context: null }

  const session = await createServerSupabaseClient()
  const userResult = await session.auth.getUser()
  if (userResult.error || !userResult.data.user) return { response: json({ error: "Authentication is required." }, 401), context: null }

  const contextResult = await session.rpc("get_my_major_room_scorecard_context", { p_play_day_id: playDayId })
  if (contextResult.error) return { response: json({ error: "The Masters room could not be authorized." }, 503), context: null }
  const context = contextResult.data as MajorRoomScorecardContext | null
  if (!context?.group_id || !Array.isArray(context.roster) || !isCompleteMastersRoomRoster(context.roster)) {
    return { response: json({ error: "A complete published Masters room assignment is required." }, 403), context: null }
  }
  return { response: null, context }
}

async function currentProof(groupId: string) {
  const service = createScorecardServiceClient()
  const result = await service
    .from("major_room_scorecard_proofs")
    .select("id,schedule_group_id,play_day_id,revision,storage_bucket,storage_path,content_type,uploaded_by_player_id,uploaded_at")
    .eq("schedule_group_id", groupId)
    .is("replaced_at", null)
    .maybeSingle()
  if (result.error) throw result.error
  return result.data
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const playDayId = url.searchParams.get("playDayId") || ""
  const authorization = await authorizeRoom(playDayId)
  if (!authorization.context) return authorization.response!

  try {
    const proof = await currentProof(authorization.context.group_id)
    if (url.searchParams.get("image") === "1") {
      const proofId = url.searchParams.get("proofId") || ""
      if (!proof || !UUID.test(proofId) || proof.id !== proofId) return json({ error: "The current room scorecard photo was not found." }, 404)
      const service = createScorecardServiceClient()
      const download = await service.storage.from(String(proof.storage_bucket)).download(String(proof.storage_path))
      if (download.error || !download.data) return json({ error: "The room scorecard photo is unavailable." }, 404)
      return new Response(await download.data.arrayBuffer(), {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Disposition": "inline",
          "Content-Type": String(proof.content_type),
          "X-Content-Type-Options": "nosniff",
        },
      })
    }

    return json({
      context: authorization.context,
      proof: proof ? {
        id: proof.id,
        schedule_group_id: proof.schedule_group_id,
        play_day_id: proof.play_day_id,
        revision: proof.revision,
        uploaded_by_player_id: proof.uploaded_by_player_id,
        uploaded_at: proof.uploaded_at,
        image_url: roomScorecardImageUrl(playDayId, proof.id),
      } : null,
    })
  } catch (caught) {
    return json({ error: caught instanceof Error ? caught.message : "The room scorecard could not be loaded." }, 503)
  }
}

export async function POST(request: Request) {
  const form = await request.formData()
  const playDayId = String(form.get("playDayId") || "")
  const authorization = await authorizeRoom(playDayId)
  if (!authorization.context) return authorization.response!

  const file = form.get("scorecard")
  const action = String(form.get("action") || "upload")
  const expectedProofId = String(form.get("expectedProofId") || "")
  if (!(file instanceof File) || !validMajorRoomScorecardFile(file)) {
    return json({ error: "Select a JPEG, PNG, WebP, or GIF scorecard no larger than 10 MB." }, 400)
  }
  if (!["upload", "replace"].includes(action)) return json({ error: "Invalid room scorecard action." }, 400)
  if (action === "replace" && !UUID.test(expectedProofId)) return json({ error: "Refresh before replacing the room scorecard photo." }, 409)

  const service = createScorecardServiceClient()
  const proofId = crypto.randomUUID()
  const extension = MAJOR_ROOM_SCORECARD_EXTENSIONS[file.type]
  const storagePath = `majors/rooms/${authorization.context.group_id}/${proofId}.${extension}`
  let proofRecorded = false

  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const digest = await crypto.subtle.digest("SHA-256", bytes)
    const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
    const upload = await service.storage.from(MAJOR_ROOM_SCORECARD_BUCKET).upload(storagePath, bytes, {
      contentType: file.type,
      upsert: false,
    })
    if (upload.error) throw upload.error

    const recorded = await service.rpc("record_major_room_scorecard_proof_service", {
      p_id: proofId,
      p_schedule_group_id: authorization.context.group_id,
      p_uploader_player_id: authorization.context.player_id,
      p_storage_bucket: MAJOR_ROOM_SCORECARD_BUCKET,
      p_storage_path: storagePath,
      p_original_file_name: file.name.slice(0, 255) || `room-scorecard.${extension}`,
      p_content_type: file.type,
      p_byte_size: file.size,
      p_sha256: sha256,
      p_replace: action === "replace",
      p_expected_proof_id: action === "replace" ? expectedProofId : null,
    })
    if (recorded.error) {
      await service.storage.from(MAJOR_ROOM_SCORECARD_BUCKET).remove([storagePath])
      return json(
        { error: recorded.error.message },
        ["23505", "40001", "PT409"].includes(recorded.error.code ?? "") ? 409 : 403,
      )
    }
    proofRecorded = true

    return json({
      saved: true,
      proof: {
        id: proofId,
        schedule_group_id: authorization.context.group_id,
        play_day_id: playDayId,
        revision: Number((recorded.data as { revision?: number } | null)?.revision || 1),
        uploaded_by_player_id: authorization.context.player_id,
        uploaded_at: String((recorded.data as { uploaded_at?: string } | null)?.uploaded_at || new Date().toISOString()),
        image_url: roomScorecardImageUrl(playDayId, proofId),
      },
    }, 201)
  } catch (caught) {
    if (!proofRecorded) await service.storage.from(MAJOR_ROOM_SCORECARD_BUCKET).remove([storagePath])
    return json({ error: caught instanceof Error ? caught.message : "The room scorecard photo could not be saved." }, 503)
  }
}
