import "server-only"

import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { trustedTournamentClient } from "@/lib/tournaments/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BUCKET = "kwt-championship-media"
const MAX_BYTES = 12 * 1024 * 1024
const statuses = new Set(["draft", "approved", "published", "archived"])

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } })
}

async function audit(client: ReturnType<typeof trustedTournamentClient>, id: string, action: string, actor: string, state: unknown, reason?: string) {
  await client.from("kwt_trophy_audit_log").insert({ entity_type: "championship_page", entity_id: id, action, actor_user_id: actor, after_state: state, reason: reason || null })
}

export async function GET() {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const result = await trustedTournamentClient().from("kwt_championship_pages").select("*").order("season_number", { ascending: false }).order("week_number", { ascending: false })
  if (result.error) return errorResponse(result.error.message, 503)
  return NextResponse.json({ pages: result.data || [] }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const client = trustedTournamentClient()
  try {
    const contentType = request.headers.get("content-type") || ""
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData()
      const id = String(form.get("id") || "").trim()
      const file = form.get("artwork")
      if (!id || !(file instanceof File) || !["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size < 1 || file.size > MAX_BYTES) {
        return errorResponse("Choose a PNG, JPG, or WebP championship image no larger than 12 MB.")
      }
      const path = `pages/${id}/${crypto.randomUUID()}.${file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"}`
      const upload = await client.storage.from(BUCKET).upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false })
      if (upload.error) throw upload.error
      const updated = await client.from("kwt_championship_pages").update({ artwork_storage_path: path, updated_at: new Date().toISOString() }).eq("id", id).select("*").single()
      if (updated.error) throw updated.error
      await audit(client, id, "artwork_uploaded", authorization.user.id, updated.data)
      return NextResponse.json({ page: updated.data })
    }
    const body = await request.json() as Record<string, unknown>
    const action = String(body.action || "save").trim()
    if (action === "create") {
      const season = Number(body.seasonNumber), week = Number(body.weekNumber), course = String(body.courseCode || "").trim()
      if (!Number.isInteger(season) || season < 1 || !Number.isInteger(week) || week < 1 || !course) return errorResponse("Season, week, and course are required.")
      const inserted = await client.from("kwt_championship_pages").insert({ season_number: season, week_number: week, course_code: course, title: String(body.title || "KWT Championship Story").trim(), article_title: String(body.articleTitle || "").trim(), story_body: String(body.storyBody || ""), supporting_media: Array.isArray(body.supportingMedia) ? body.supportingMedia : [], created_by: authorization.user.id }).select("*").single()
      if (inserted.error) return errorResponse(inserted.error.code === "23505" ? "A page already exists for that season, week, and course." : inserted.error.message, inserted.error.code === "23505" ? 409 : 503)
      await audit(client, inserted.data.id, "draft_created", authorization.user.id, inserted.data)
      return NextResponse.json({ page: inserted.data }, { status: 201 })
    }
    const id = String(body.id || "").trim()
    if (!id) return errorResponse("A championship page id is required.")
    const current = await client.from("kwt_championship_pages").select("*").eq("id", id).maybeSingle()
    if (current.error) throw current.error
    if (!current.data) return errorResponse("Championship page was not found.", 404)
    if (action === "save") {
      const patch = { title: String(body.title ?? current.data.title).trim(), article_title: String(body.articleTitle ?? current.data.article_title).trim(), story_body: String(body.storyBody ?? current.data.story_body), supporting_media: Array.isArray(body.supportingMedia) ? body.supportingMedia : current.data.supporting_media, updated_at: new Date().toISOString() }
      const updated = await client.from("kwt_championship_pages").update(patch).eq("id", id).select("*").single()
      if (updated.error) throw updated.error
      await audit(client, id, "draft_saved", authorization.user.id, updated.data)
      return NextResponse.json({ page: updated.data })
    }
    if (action === "set_status") {
      const status = String(body.status || "").trim().toLowerCase()
      if (!statuses.has(status)) return errorResponse("Invalid publication state.")
      if (status === "published" && !current.data.article_title.trim() && !current.data.story_body.trim()) return errorResponse("A published page needs an approved story or article title.", 409)
      const updated = await client.from("kwt_championship_pages").update({ status, approved_by: status === "approved" || status === "published" ? authorization.user.id : current.data.approved_by, published_at: status === "published" ? new Date().toISOString() : current.data.published_at, updated_at: new Date().toISOString() }).eq("id", id).select("*").single()
      if (updated.error) throw updated.error
      await audit(client, id, `status_${status}`, authorization.user.id, updated.data, status === "published" ? "Admin explicitly published a completed championship story." : undefined)
      return NextResponse.json({ page: updated.data })
    }
    return errorResponse("Unknown championship-page action.")
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Championship page operation failed.", 503)
  }
}
