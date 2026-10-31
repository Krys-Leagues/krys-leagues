import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { CANONICAL_PUBLIC_HOST } from "@/lib/canonicalHost"
import {
  createDiscordMessage,
  deleteDiscordMessage,
  DiscordApiError,
  formatMastersVerificationAlert,
  hasMastersVerificationWork,
  mastersVerificationPayloadHash,
  MASTERS_VERIFICATION_DISCORD_CHANNEL_ID,
  updateDiscordMessage,
  validateMastersAdminRecipients,
  type MastersAdminDmRecipient,
  type MastersVerificationRoomState,
} from "@/lib/mastersDiscord"
import { getDiscordBotToken } from "@/lib/matchDiscordServer"

type VerificationContext = {
  major_event_id: string
  play_day_id: string
  schedule_group_id: string
  round_number: number
  room_label: string
}

type VerificationClaim = {
  claimed: boolean
  alert_id?: string
  sync_token?: string
  discord_message_id?: string | null
  last_payload_hash?: string | null
}

export async function loadMastersAdminDmRecipients(service: SupabaseClient) {
  const response = await service.rpc("get_masters_admin_dm_recipients")
  if (response.error) throw new Error(response.error.message)
  return validateMastersAdminRecipients((response.data || []) as MastersAdminDmRecipient[])
}

export async function resolveMastersVerificationContext(
  authenticatedClient: SupabaseClient,
  scorecardId: string,
) {
  const response = await authenticatedClient.rpc("get_major_verification_discord_context", {
    p_scorecard_id: scorecardId,
  })
  if (response.error || !response.data) {
    throw new Error(response.error?.message || "Masters verification context is unavailable.")
  }
  return response.data as VerificationContext
}

async function loadRoomState(service: SupabaseClient, context: VerificationContext) {
  const response = await service.rpc("get_major_verification_discord_room_state", {
    p_major_event_id: context.major_event_id,
    p_play_day_id: context.play_day_id,
    p_schedule_group_id: context.schedule_group_id,
  })
  if (response.error || !response.data) {
    throw new Error(response.error?.message || "Masters verification room state is unavailable.")
  }
  return response.data as MastersVerificationRoomState
}

async function claimRoomAlert(
  service: SupabaseClient,
  state: MastersVerificationRoomState,
  payloadHash: string,
) {
  const response = await service.rpc("claim_major_verification_discord_alert", {
    p_major_event_id: state.major_event_id,
    p_play_day_id: state.play_day_id,
    p_schedule_group_id: state.schedule_group_id,
    p_discord_channel_id: MASTERS_VERIFICATION_DISCORD_CHANNEL_ID,
    p_payload_hash: payloadHash,
  })
  if (response.error || !response.data) {
    throw new Error(response.error?.message || "Masters verification alert could not be claimed.")
  }
  return response.data as VerificationClaim
}

async function finalizeRoomAlert(service: SupabaseClient, options: {
  alertId: string
  syncToken: string
  status: "active" | "resolved" | "failed"
  discordMessageId: string | null
  payloadHash: string | null
  error: string | null
}) {
  const response = await service.rpc("finalize_major_verification_discord_alert", {
    p_alert_id: options.alertId,
    p_sync_token: options.syncToken,
    p_status: options.status,
    p_discord_message_id: options.discordMessageId,
    p_payload_hash: options.payloadHash,
    p_error: options.error,
  })
  if (response.error) throw new Error(response.error.message)
}

export async function syncMastersVerificationDiscordRoom(options: {
  service: SupabaseClient
  context: VerificationContext
  botToken?: string | null
}) {
  const botToken = options.botToken ?? getDiscordBotToken()
  if (!botToken) throw new Error("Masters Discord delivery is not configured.")

  for (let pass = 0; pass < 2; pass += 1) {
    const state = await loadRoomState(options.service, options.context)
    const reviewUrl = `https://${CANONICAL_PUBLIC_HOST}/admin/majors/verification`
    const content = formatMastersVerificationAlert(state, reviewUrl)
    const payloadHash = mastersVerificationPayloadHash(state, content)
    const claim = await claimRoomAlert(options.service, state, payloadHash)
    if (!claim.claimed || !claim.alert_id || !claim.sync_token) return { synced: false as const, reason: "busy" as const }

    let messageId = claim.discord_message_id || null
    try {
      if (!hasMastersVerificationWork(state)) {
        if (messageId) {
          await deleteDiscordMessage({
            botToken,
            channelId: MASTERS_VERIFICATION_DISCORD_CHANNEL_ID,
            messageId,
          })
        }
        await finalizeRoomAlert(options.service, {
          alertId: claim.alert_id,
          syncToken: claim.sync_token,
          status: "resolved",
          discordMessageId: messageId,
          payloadHash,
          error: null,
        })
      } else if (messageId && claim.last_payload_hash === payloadHash) {
        await finalizeRoomAlert(options.service, {
          alertId: claim.alert_id,
          syncToken: claim.sync_token,
          status: "active",
          discordMessageId: messageId,
          payloadHash,
          error: null,
        })
      } else if (messageId) {
        try {
          await updateDiscordMessage({
            botToken,
            channelId: MASTERS_VERIFICATION_DISCORD_CHANNEL_ID,
            messageId,
            content,
          })
        } catch (caught) {
          if (!(caught instanceof DiscordApiError) || caught.status !== 404) throw caught
          messageId = await createDiscordMessage({
            botToken,
            channelId: MASTERS_VERIFICATION_DISCORD_CHANNEL_ID,
            content,
          })
        }
        await finalizeRoomAlert(options.service, {
          alertId: claim.alert_id,
          syncToken: claim.sync_token,
          status: "active",
          discordMessageId: messageId,
          payloadHash,
          error: null,
        })
      } else {
        messageId = await createDiscordMessage({
          botToken,
          channelId: MASTERS_VERIFICATION_DISCORD_CHANNEL_ID,
          content,
        })
        await finalizeRoomAlert(options.service, {
          alertId: claim.alert_id,
          syncToken: claim.sync_token,
          status: "active",
          discordMessageId: messageId,
          payloadHash,
          error: null,
        })
      }
    } catch (caught) {
      const error = caught instanceof Error ? caught.message.slice(0, 500) : "Discord synchronization failed."
      await finalizeRoomAlert(options.service, {
        alertId: claim.alert_id,
        syncToken: claim.sync_token,
        status: "failed",
        discordMessageId: messageId,
        payloadHash: null,
        error,
      }).catch(() => undefined)
      throw caught
    }

    const latest = await loadRoomState(options.service, options.context)
    const latestContent = formatMastersVerificationAlert(latest, reviewUrl)
    if (mastersVerificationPayloadHash(latest, latestContent) === payloadHash) {
      return { synced: true as const, status: hasMastersVerificationWork(latest) ? "active" as const : "resolved" as const }
    }
  }
  return { synced: true as const, status: "pending_resync" as const }
}
