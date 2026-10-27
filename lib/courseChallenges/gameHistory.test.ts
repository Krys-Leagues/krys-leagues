import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  buildCourseChallengeGameSummary,
  type CourseChallengeDiscordGameRow,
  type CourseChallengeDiscordParticipantRow,
} from "./gameHistory.ts"

const migrationPath = "supabase/migrations/20260929224120_course_challenge_discord_game_history.sql"

function game(
  id: string,
  status: CourseChallengeDiscordGameRow["status"],
  book: CourseChallengeDiscordGameRow["book_key"],
  started: boolean,
): CourseChallengeDiscordGameRow {
  return {
    game_id: id,
    revision: 1,
    book_key: book,
    original_creator_discord_user_id: "1",
    current_owner_discord_user_id: "1",
    max_players: 4,
    status,
    created_at: "2026-09-29T12:00:00Z",
    lobby_deadline: "2026-09-29T12:05:00Z",
    started_at: started ? "2026-09-29T12:02:00Z" : null,
    completed_at: status === "completed" ? "2026-09-29T12:20:00Z" : null,
    cancelled_at: status === "cancelled" ? "2026-09-29T12:05:00Z" : null,
    voided_at: status === "voided" ? "2026-09-29T12:10:00Z" : null,
    end_reason: null,
    room_name: started ? "KCTT01" : null,
    discord_channel_id: "10",
    discord_thread_id: "20",
    discord_lobby_message_id: "30",
    last_synced_at: "2026-09-29T12:20:00Z",
  }
}

function participant(gameId: string, userId: string): CourseChallengeDiscordParticipantRow {
  return {
    game_id: gameId,
    discord_user_id: userId,
    display_name: `Player ${userId}`,
    first_joined_at: "2026-09-29T12:00:00Z",
    latest_joined_at: "2026-09-29T12:00:00Z",
    left_at: null,
    original_creator: userId === "1",
    owner_at_start: userId === "1",
    present_at_start: true,
    played: true,
    left_before_start: false,
    left_after_start: false,
    confirmed_scorecard: false,
    confirmed_at: null,
  }
}

test("game-history summary uses lifecycle rows without recalculating game results", () => {
  const games = [
    game("10000000-0000-4000-8000-000000000001", "completed", "tourist-trap", true),
    game("10000000-0000-4000-8000-000000000002", "cancelled", "cherry-blossom", false),
    game("10000000-0000-4000-8000-000000000003", "started", "cherry-blossom", true),
  ]
  const participants = [
    participant(games[0].game_id, "1"),
    participant(games[0].game_id, "2"),
    participant(games[1].game_id, "3"),
    participant(games[2].game_id, "4"),
    participant(games[2].game_id, "5"),
    participant(games[2].game_id, "6"),
  ]
  const summary = buildCourseChallengeGameSummary(games, participants)
  assert.deepEqual(summary, {
    totalGames: 3,
    startedGames: 2,
    completedGames: 1,
    cancelledGames: 1,
    voidedGames: 0,
    activeGames: 1,
    totalPlayerParticipations: 6,
    averagePlayersPerStartedGame: 2.5,
    touristTrapGames: 1,
    cherryBlossomGames: 2,
  })
})

test("history migration is private, idempotent, and uses a fixed-path protected RPC", async () => {
  const sql = await readFile(migrationPath, "utf8")
  assert.match(sql, /create table if not exists public\.course_challenge_discord_games/i)
  assert.match(sql, /enable row level security/gi)
  assert.match(sql, /force row level security/gi)
  assert.match(sql, /revoke all on table[\s\S]*from public, anon, authenticated/gi)
  assert.doesNotMatch(sql, /grant (?:select|insert|update|delete)[^;]+\b(?:anon|authenticated)\b/i)
  assert.match(sql, /create or replace function public\.sync_course_challenge_discord_game\(p_snapshot jsonb\)/i)
  assert.match(sql, /security definer\s+set search_path = ''/i)
  assert.match(sql, /pg_advisory_xact_lock/i)
  assert.match(sql, /if v_existing_revision is not null and v_existing_revision > v_revision/i)
  assert.match(sql, /on conflict \(game_id\) do update/i)
  assert.match(sql, /revoke all on function public\.sync_course_challenge_discord_game\(jsonb\)[\s\S]*from public, anon, authenticated/i)
  assert.match(sql, /grant execute on function public\.sync_course_challenge_discord_game\(jsonb\)[\s\S]*to service_role/i)
})

test("internal history writes require HMAC and admin history reads require site-admin auth", async () => {
  const [internalRoute, adminRoute] = await Promise.all([
    readFile("app/api/internal/course-challenges/games/route.ts", "utf8"),
    readFile("app/api/admin/course-challenges/games/route.ts", "utf8"),
  ])
  assert.ok(internalRoute.indexOf("verifyScorecardBridgeRequest") < internalRoute.indexOf("createScorecardServiceClient"))
  assert.match(internalRoute, /sync_course_challenge_discord_game/)
  assert.ok(adminRoute.indexOf("authorizeSiteAdminMutation()") < adminRoute.indexOf("createScorecardServiceClient()"))
  assert.doesNotMatch(adminRoute, /createBrowserClient|NEXT_PUBLIC_SUPABASE_ANON_KEY/)
})
