import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import {
  deleteKwtRoomSignupMessages,
  KWT_ROOM_SIGNUP_CHANNEL_ID,
  planKwtRoomSignupCleanup,
  runKwtRoomSignupCleanupExclusive,
} from "@/lib/kwtRoomSignupCleanup"
import {
  createKwtCleanupAuditClient,
  createKwtDiscordDeleteTransport,
  getKwtDiscordBotToken,
  loadKwtRoomSignupChannel,
  loadKwtRoomSignupMessages,
} from "@/lib/kwtRoomSignupCleanupServer"

export const runtime = "nodejs"

type AuditStatus = "success" | "already_clear" | "partial" | "failed"

export async function POST() {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  const exclusive = await runKwtRoomSignupCleanupExclusive(async () => {
    const token = getKwtDiscordBotToken()
    if (!token) {
      return NextResponse.json(
        { error: "The Discord bot is not configured for KWT cleanup." },
        { status: 503 },
      )
    }

    const audit = createKwtCleanupAuditClient()
    const staleCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    await audit
      .from("kwt_room_signup_cleanup_audit")
      .update({
        final_status: "failed",
        completed_at: new Date().toISOString(),
        failure_details: [{ error: "stale_execution_recovered" }],
      })
      .eq("target_channel_id", KWT_ROOM_SIGNUP_CHANNEL_ID)
      .eq("final_status", "running")
      .lt("created_at", staleCutoff)

    const started = await audit
      .from("kwt_room_signup_cleanup_audit")
      .insert({
        actor_user_id: authorization.user.id,
        target_channel_id: KWT_ROOM_SIGNUP_CHANNEL_ID,
      })
      .select("id")
      .single()

    if (started.error) {
      if (started.error.code === "23505") {
        return NextResponse.json(
          { error: "A KWT room-signup cleanup is already running." },
          { status: 409 },
        )
      }
      console.error("KWT_ROOM_SIGNUP_CLEANUP_AUDIT_START_FAILED", {
        admin_user_id: authorization.user.id,
        error: started.error.message,
      })
      return NextResponse.json({ error: "The cleanup audit could not be started." }, { status: 503 })
    }

    const auditId = String(started.data.id)
    try {
      await loadKwtRoomSignupChannel(token)
      const inventory = await loadKwtRoomSignupMessages(token)
      const plan = planKwtRoomSignupCleanup(inventory.messages, inventory.pinnedIds)
      const deletion = await deleteKwtRoomSignupMessages({
        candidates: plan.candidates,
        transport: createKwtDiscordDeleteTransport(token),
      })
      const finalStatus: AuditStatus = plan.candidates.length === 0
        ? "already_clear"
        : deletion.failures.length === 0
          ? "success"
          : deletion.deletedCount > 0
            ? "partial"
            : "failed"
      const saved = await audit
        .from("kwt_room_signup_cleanup_audit")
        .update({
          candidate_count: plan.candidates.length,
          deleted_count: deletion.deletedCount,
          failed_count: deletion.failures.length,
          protected_count: plan.protected.total,
          protected_breakdown: plan.protected,
          failure_details: deletion.failures,
          final_status: finalStatus,
          completed_at: new Date().toISOString(),
        })
        .eq("id", auditId)
        .eq("final_status", "running")
      if (saved.error) throw new Error("KWT cleanup audit could not be completed.")

      return NextResponse.json({
        status: finalStatus,
        candidateCount: plan.candidates.length,
        deletedCount: deletion.deletedCount,
        failedCount: deletion.failures.length,
        protected: plan.protected,
        deletionMethod: deletion.method,
      }, { status: finalStatus === "partial" ? 207 : finalStatus === "failed" ? 502 : 200 })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown cleanup failure."
      await audit
        .from("kwt_room_signup_cleanup_audit")
        .update({
          failed_count: 1,
          failure_details: [{ error: message }],
          final_status: "failed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", auditId)
        .eq("final_status", "running")
      console.error("KWT_ROOM_SIGNUP_CLEANUP_FAILED", {
        admin_user_id: authorization.user.id,
        target_channel_id: KWT_ROOM_SIGNUP_CHANNEL_ID,
        error: message,
      })
      return NextResponse.json(
        { error: "KWT cleanup failed safely. No ambiguous messages were deleted." },
        { status: 502 },
      )
    }
  })

  if (exclusive.status === "in-flight") {
    return NextResponse.json(
      { error: "A KWT room-signup cleanup is already running." },
      { status: 409 },
    )
  }
  return exclusive.value
}
