import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { authorizeDoublesParticipant, createDoublesRuntimeClient } from "@/lib/doublesParticipantServer"

type CourseSlot = "HOME_TEAM_COURSE" | "AWAY_TEAM_COURSE"

function isCourseSlot(value: FormDataEntryValue | null): value is CourseSlot {
  return value === "HOME_TEAM_COURSE" || value === "AWAY_TEAM_COURSE"
}

export async function POST(request: Request) {
  const form = await request.formData()
  const fixtureId = String(form.get("fixture_id") || "")
  const courseSlot = form.get("course_slot")
  const file = form.get("file")
  if (!fixtureId || !isCourseSlot(courseSlot) || !(file instanceof File)) return NextResponse.json({ error: "Fixture, course slot and image are required" }, { status: 400 })
  if (!file.type.startsWith("image/") || file.size <= 0 || file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Scorecard evidence must be an image no larger than 10 MB" }, { status: 400 })
  const authorization = await authorizeDoublesParticipant(fixtureId)
  if (!authorization.authorized) return NextResponse.json({ error: authorization.message }, { status: authorization.status })
  const client = createDoublesRuntimeClient()
  const existing = await client.from("doubles_course_evidence").select("id,storage_path,status").eq("fixture_id", fixtureId).eq("course_slot", courseSlot).maybeSingle()
  if (existing.error) return NextResponse.json({ error: "Evidence state is unavailable" }, { status: 503 })
  if (existing.data?.status === "VERIFIED") return NextResponse.json({ error: "Verified evidence is locked" }, { status: 409 })
  const storagePath = existing.data?.storage_path || `${fixtureId}/${courseSlot}/${randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`
  const upload = await client.storage.from("doubles-scorecard-evidence").upload(storagePath, file, { contentType: file.type || "application/octet-stream", upsert: Boolean(existing.data) })
  if (upload.error) return NextResponse.json({ error: "Private evidence upload failed" }, { status: 503 })
  const saved = await client.from("doubles_course_evidence").upsert({ fixture_id: fixtureId, course_slot: courseSlot, storage_path: storagePath, original_filename: file.name, content_type: file.type || "application/octet-stream", status: "SUBMITTED", uploaded_by: authorization.participantId, uploaded_at: new Date().toISOString(), reviewed_by: null, reviewed_at: null }, { onConflict: "fixture_id,course_slot" }).select("id,fixture_id,course_slot,original_filename,content_type,status,uploaded_by,uploaded_at,reviewed_at").single()
  if (saved.error) return NextResponse.json({ error: "Evidence uploaded but could not be recorded" }, { status: 503 })
  await client.from("doubles_result_audit").insert({ fixture_id: fixtureId, action: existing.data ? "EVIDENCE_REPLACED" : "EVIDENCE_UPLOADED", actor_player_id: authorization.participantId, course_slot: courseSlot, after_payload: saved.data })
  return NextResponse.json({ evidence: saved.data })
}
