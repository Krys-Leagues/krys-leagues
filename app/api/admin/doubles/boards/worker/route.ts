import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createDoublesRuntimeClient } from "@/lib/doublesParticipantServer"
import { boardRetry } from "@/lib/doublesSystems"

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  let body: { action?: string; task_id?: string; mapping_id?: string; error_kind?: "temporary" | "not_found" | "permanent" }
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid board worker request" }, { status: 400 }) }
  const client = createDoublesRuntimeClient()
  if (body.action === "claim") {
    const now = new Date().toISOString()
    const stale = await client.from("doubles_board_outbox").update({ status: "RETRYABLE", claimed_at: null, claimed_by: null }).eq("status", "CLAIMED").lt("claimed_at", new Date(Date.now() - 10 * 60 * 1000).toISOString()).select("id")
    if (stale.error) return NextResponse.json({ error: "Could not recover stale board tasks" }, { status: 503 })
    const task = await client.from("doubles_board_outbox").select("id,mapping_id,attempts,status,available_at").in("status", ["PENDING", "RETRYABLE"]).lte("available_at", now).order("available_at").limit(1).maybeSingle()
    if (task.error) return NextResponse.json({ error: "Could not poll board tasks" }, { status: 503 })
    if (!task.data) return NextResponse.json({ task: null })
    const claimed = await client.from("doubles_board_outbox").update({ status: "CLAIMED", claimed_at: now, claimed_by: "admin-worker" }).eq("id", task.data.id).in("status", ["PENDING", "RETRYABLE"]).select("id,mapping_id,attempts,status").maybeSingle()
    return claimed.error || !claimed.data ? NextResponse.json({ task: null }) : NextResponse.json({ task: claimed.data })
  }
  if (body.action === "ack" && body.task_id && body.mapping_id) {
    const [task, mapping] = await Promise.all([
      client.from("doubles_board_outbox").update({ status: "DONE", claimed_at: null, claimed_by: null }).eq("id", body.task_id).select("id").maybeSingle(),
      client.from("doubles_board_mappings").update({ sync_state: "SYNCED", last_synced_at: new Date().toISOString(), last_error: null }).eq("id", body.mapping_id).select("id,sync_state").maybeSingle(),
    ])
    if (task.error || mapping.error) return NextResponse.json({ error: "Could not acknowledge board task" }, { status: 503 })
    return NextResponse.json({ acknowledged: true })
  }
  if (body.action === "fail" && body.task_id && body.mapping_id && body.error_kind) {
    const current = await client.from("doubles_board_outbox").select("attempts").eq("id", body.task_id).maybeSingle()
    if (current.error || !current.data) return NextResponse.json({ error: "Board task not found" }, { status: 404 })
    const retry = boardRetry(current.data.attempts, body.error_kind)
    const update = { status: retry.state === "NOT_FOUND" ? "NOT_FOUND" : retry.state === "EXHAUSTED" ? "EXHAUSTED" : "RETRYABLE", attempts: current.data.attempts + 1, available_at: retry.delayMs == null ? new Date().toISOString() : new Date(Date.now() + retry.delayMs).toISOString(), claimed_at: null, claimed_by: null, last_error: body.error_kind }
    const [task, mapping] = await Promise.all([
      client.from("doubles_board_outbox").update(update).eq("id", body.task_id).select("id,status,attempts").maybeSingle(),
      client.from("doubles_board_mappings").update({ sync_state: retry.state === "NOT_FOUND" ? "NOT_FOUND" : retry.state === "EXHAUSTED" ? "EXHAUSTED" : "RETRYABLE", last_error: body.error_kind }).eq("id", body.mapping_id).select("id,sync_state").maybeSingle(),
    ])
    if (task.error || mapping.error) return NextResponse.json({ error: "Could not record board failure" }, { status: 503 })
    return NextResponse.json({ task: task.data, mapping: mapping.data })
  }
  return NextResponse.json({ error: "Unsupported worker action" }, { status: 400 })
}
