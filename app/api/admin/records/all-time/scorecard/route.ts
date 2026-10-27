import { NextResponse } from "next/server"

import { validScorecardFile } from "@/lib/all-time/fast-entry-workflow"
import { ALL_TIME_SCORECARD_BUCKET, createAllTimeScorecardServiceClient, isMissingScorecardSchema } from "@/lib/all-time/scorecard-server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

export const runtime = "nodejs"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  try {
    const form = await request.formData()
    const file = form.get("scorecard")
    const observationId = String(form.get("observationId") ?? "")
    const playerId = String(form.get("playerId") ?? "")
    const courseId = String(form.get("courseId") ?? "")
    if (!(file instanceof File) || !validScorecardFile(file)) return json({ error: "Select a JPEG, PNG, WebP, or GIF scorecard no larger than 10 MB." }, 400)
    if (![observationId, playerId, courseId].every((value) => UUID.test(value))) return json({ error: "The saved All-Time entry reference is invalid." }, 400)

    const service = createAllTimeScorecardServiceClient()
    const observation = await service.from("all_time_record_observations").select("id,player_id,course_id,recorded_by").eq("id", observationId).maybeSingle()
    if (observation.error) throw observation.error
    if (!observation.data || observation.data.player_id !== playerId || observation.data.course_id !== courseId) return json({ error: "The scorecard does not match the saved canonical player and course." }, 409)

    const prior = await service.from("all_time_scorecard_attachments").select("id").eq("observation_id", observationId).maybeSingle()
    if (isMissingScorecardSchema(prior.error)) return json({ error: "Scorecard storage migration is required before originals can be attached.", code: "migration_required" }, 503)
    if (prior.error) throw prior.error
    if (prior.data) return json({ attached: true, alreadyAttached: true })

    const bytes = new Uint8Array(await file.arrayBuffer())
    const digest = await crypto.subtle.digest("SHA-256", bytes)
    const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
    const storagePath = `${observationId}/${crypto.randomUUID()}.${EXTENSIONS[file.type]}`
    const upload = await service.storage.from(ALL_TIME_SCORECARD_BUCKET).upload(storagePath, bytes, { contentType: file.type, upsert: false })
    if (isMissingScorecardSchema(upload.error)) return json({ error: "Scorecard storage migration is required before originals can be attached.", code: "migration_required" }, 503)
    if (upload.error) throw upload.error

    const inserted = await service.from("all_time_scorecard_attachments").insert({
      observation_id: observationId,
      player_id: playerId,
      course_id: courseId,
      storage_path: storagePath,
      original_file_name: file.name.slice(0, 255),
      content_type: file.type,
      byte_size: file.size,
      sha256,
      uploaded_by: authorization.user.id,
    }).select("id").single()
    if (inserted.error) {
      await service.storage.from(ALL_TIME_SCORECARD_BUCKET).remove([storagePath])
      if (isMissingScorecardSchema(inserted.error)) return json({ error: "Scorecard storage migration is required before originals can be attached.", code: "migration_required" }, 503)
      throw inserted.error
    }
    return json({ attached: true }, 201)
  } catch (caught) {
    return json({ error: caught instanceof Error ? caught.message : "The scorecard could not be attached to the saved entry." }, 503)
  }
}
