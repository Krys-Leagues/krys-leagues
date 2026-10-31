import type { SupabaseClient } from "@supabase/supabase-js"
import type { DiscordWorkerStore } from "./doublesDiscordWorker.ts"

export function createDoublesDiscordSupabaseStore(client: SupabaseClient): DiscordWorkerStore {
  return {
    async getDivision(seasonId, division) {
      const result = await client.from("doubles_discord_division_mappings").select("season_id,division,arrange_channel_id,arrange_message_id,board_channel_id,board_message_id,board_state,test_mode").eq("season_id", seasonId).eq("division", division).maybeSingle()
      if (result.error) throw new Error(result.error.message)
      if (!result.data) return null
      return { seasonId: result.data.season_id, division: result.data.division, arrangeChannelId: result.data.arrange_channel_id, arrangeMessageId: result.data.arrange_message_id, boardChannelId: result.data.board_channel_id, boardMessageId: result.data.board_message_id, status: result.data.test_mode ? "TEST" : result.data.board_state === "HISTORICAL" ? "HISTORICAL" : result.data.board_state === "FAILED" || result.data.board_state === "EXHAUSTED" || result.data.board_state === "NOT_FOUND" ? "FAILED" : "ACTIVE" }
    },
    async saveDivision(mapping) {
      const result = await client.from("doubles_discord_division_mappings").upsert({ season_id: mapping.seasonId, division: mapping.division, arrange_channel_id: mapping.arrangeChannelId, arrange_message_id: mapping.arrangeMessageId, board_channel_id: mapping.boardChannelId, board_message_id: mapping.boardMessageId, board_state: mapping.status === "HISTORICAL" ? "HISTORICAL" : mapping.status === "FAILED" ? "FAILED" : mapping.status === "TEST" ? "TEST" : "SYNCED", test_mode: mapping.status === "TEST", updated_at: new Date().toISOString() }, { onConflict: "season_id,division" })
      if (result.error) throw new Error(result.error.message)
    },
    async getFixture(fixtureId) {
      const result = await client.from("doubles_discord_fixture_mappings").select("fixture_id,thread_id,thread_channel_id,starter_message_id,match_image_message_id,submit_component_message_id,thread_state,test_mode").eq("fixture_id", fixtureId).maybeSingle()
      if (result.error) throw new Error(result.error.message)
      if (!result.data) return null
      return { fixtureId: result.data.fixture_id, threadId: result.data.thread_id, threadChannelId: result.data.thread_channel_id, starterMessageId: result.data.starter_message_id, matchImageMessageId: result.data.match_image_message_id, submitComponentMessageId: result.data.submit_component_message_id, state: result.data.test_mode ? "TEST" : result.data.thread_state }
    },
    async saveFixture(mapping) {
      const result = await client.from("doubles_discord_fixture_mappings").upsert({ fixture_id: mapping.fixtureId, thread_id: mapping.threadId, thread_channel_id: mapping.threadChannelId, starter_message_id: mapping.starterMessageId, match_image_message_id: mapping.matchImageMessageId, submit_component_message_id: mapping.submitComponentMessageId, thread_state: mapping.state, test_mode: mapping.state === "TEST", updated_at: new Date().toISOString() }, { onConflict: "fixture_id" })
      if (result.error) throw new Error(result.error.message)
    },
  }
}
