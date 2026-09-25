import type { SupabaseClient } from "@supabase/supabase-js"
import { eventIdempotencyKey, type DoublesDiscordEvent, type DoublesDiscordEventStore } from "./doublesDiscordEventDispatcher.ts"

export function createDoublesDiscordEventStore(client: SupabaseClient): DoublesDiscordEventStore {
  return {
    async enqueue(event) {
      const key = event.eventId || eventIdempotencyKey(event)
      const result = await client.from("doubles_discord_event_outbox").upsert({ event_type: event.eventType, season_id: event.seasonId, division: event.division, fixture_id: event.fixtureId || null, channel_id: event.channelId, payload: { ...event }, idempotency_key: key, status: "PENDING", available_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "idempotency_key", ignoreDuplicates: true }).select("id").maybeSingle()
      if (result.error) throw new Error(result.error.message)
      if (result.data?.id) return { id: result.data.id }
      const existing = await client.from("doubles_discord_event_outbox").select("id").eq("idempotency_key", key).single()
      if (existing.error || !existing.data) throw new Error(existing.error?.message || "Event outbox row was not found after idempotent enqueue")
      return { id: existing.data.id }
    },
    async recoverStale() {
      const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      const result = await client.from("doubles_discord_event_outbox").update({ status: "RETRYABLE", claimed_at: null, claimed_by: null, updated_at: new Date().toISOString() }).eq("status", "CLAIMED").lt("claimed_at", cutoff)
      if (result.error) throw new Error(result.error.message)
    },
    async claim() {
      const task = await client.from("doubles_discord_event_outbox").select("id,event_type,season_id,division,fixture_id,channel_id,payload,attempts").in("status", ["PENDING", "RETRYABLE"]).lte("available_at", new Date().toISOString()).order("available_at").limit(1).maybeSingle()
      if (task.error || !task.data) return null
      const claimed = await client.from("doubles_discord_event_outbox").update({ status: "CLAIMED", claimed_at: new Date().toISOString(), claimed_by: "doubles-discord-worker", updated_at: new Date().toISOString() }).eq("id", task.data.id).in("status", ["PENDING", "RETRYABLE"]).select("id,event_type,season_id,division,fixture_id,channel_id,payload,attempts").maybeSingle()
      if (claimed.error || !claimed.data) return null
      return { ...(claimed.data.payload as DoublesDiscordEvent), id: claimed.data.id, attempts: claimed.data.attempts }
    },
    async ack(id) {
      const result = await client.from("doubles_discord_event_outbox").update({ status: "DONE", claimed_at: null, claimed_by: null, updated_at: new Date().toISOString() }).eq("id", id)
      if (result.error) throw new Error(result.error.message)
    },
    async fail(id, state, error, availableAt) {
      const current = await client.from("doubles_discord_event_outbox").select("attempts").eq("id", id).single()
      if (current.error || !current.data) throw new Error(current.error?.message || "Discord event outbox row was not found")
      const result = await client.from("doubles_discord_event_outbox").update({ status: state, attempts: current.data.attempts + 1, last_error: error, available_at: availableAt, claimed_at: null, claimed_by: null, updated_at: new Date().toISOString() }).eq("id", id)
      if (result.error) throw new Error(result.error.message)
    },
  }
}
