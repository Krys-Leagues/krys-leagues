import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  occupiedStrokeDivisions,
  strokeGameState,
  validateStrokeBoard,
  type StrokeDivisionBoard,
} from "./strokePilot"

type RosterRow = { id: string; season_id: string; division_count: number; status: string; created_at: string }
type SlotRow = { division_number: number; player_id: string; player_screen_name: string }
type FixtureRow = { id: string; division_number: number; game_number: number; player1_id: string; player2_id: string; player1_name: string | null; player2_name: string | null; course: string | null }
type ResultRow = { schedule_id: string; player1_score: number | null; player2_score: number | null }
type ContextRow = { id: string; source_key: string }
type EvidenceRow = { id: string; context_id: string }
type StandingRow = { player_id: string; rank: number; wins: number; losses: number; ties: number; strokes: number; points: number }

export async function loadAuthoritativeStrokeBoards(client: SupabaseClient): Promise<StrokeDivisionBoard[]> {
  const rosterResponse = await client.from("stroke_roster_versions")
    .select("id,season_id,division_count,status,created_at")
    .eq("status", "approved").order("created_at", { ascending: false }).limit(1).maybeSingle()
  if (rosterResponse.error || !rosterResponse.data) throw new Error("STROKE_CURRENT_ROSTER_UNAVAILABLE")
  const roster = rosterResponse.data as RosterRow
  const [seasonResponse, slotsResponse, fixtureResponse] = await Promise.all([
    client.from("seasons").select("id,season_number").eq("id", roster.season_id).eq("league_type", "stroke").single(),
    client.from("stroke_division_roster_slots").select("division_number,player_id,player_screen_name").eq("roster_version_id", roster.id),
    client.from("schedule").select("id,division_number,game_number,player1_id,player2_id,player1_name,player2_name,course").eq("league_type", "stroke").eq("season_id", roster.season_id).eq("roster_version_id", roster.id),
  ])
  if (seasonResponse.error || slotsResponse.error || fixtureResponse.error) throw new Error("STROKE_CURRENT_BOARD_SOURCE_UNAVAILABLE")
  const slots = (slotsResponse.data || []) as SlotRow[]
  const fixtures = (fixtureResponse.data || []) as FixtureRow[]
  const fixtureIds = fixtures.map((fixture) => fixture.id)
  const [resultsResponse, contextsResponse, standingsResponse] = await Promise.all([
    fixtureIds.length ? client.from("results").select("schedule_id,player1_score,player2_score").eq("league_type", "stroke").in("schedule_id", fixtureIds) : Promise.resolve({ data: [], error: null }),
    fixtureIds.length ? client.from("shared_scorecard_contexts").select("id,source_key").eq("adapter_key", "stroke").eq("source_type", "fixture").in("source_key", fixtureIds) : Promise.resolve({ data: [], error: null }),
    client.from("season_standings").select("player_id,rank,wins,losses,ties,strokes,points").eq("league_type", "stroke").eq("season_number", Number(seasonResponse.data.season_number)),
  ])
  if (resultsResponse.error || contextsResponse.error || standingsResponse.error) throw new Error("STROKE_CURRENT_BOARD_DETAIL_UNAVAILABLE")
  const contexts = (contextsResponse.data || []) as ContextRow[]
  const contextIds = contexts.map((context) => context.id)
  const evidenceResponse = contextIds.length
    ? await client.from("shared_scorecard_evidence").select("id,context_id").in("context_id", contextIds).in("review_status", ["uploading", "submitted", "under_review", "verified"])
    : { data: [], error: null }
  if (evidenceResponse.error) throw new Error("STROKE_CURRENT_EVIDENCE_UNAVAILABLE")

  const results = new Map(((resultsResponse.data || []) as ResultRow[]).map((result) => [result.schedule_id, result]))
  const contextByFixture = new Map(contexts.map((context) => [context.source_key, context.id]))
  const evidenceByContext = new Map(((evidenceResponse.data || []) as EvidenceRow[]).map((evidence) => [evidence.context_id, evidence.id]))
  const names = new Map(slots.map((slot) => [slot.player_id, slot.player_screen_name]))
  const standings = (standingsResponse.data || []) as StandingRow[]
  const divisions = occupiedStrokeDivisions(slots)

  return divisions.map((division) => validateStrokeBoard({
    seasonId: roster.season_id,
    seasonNumber: Number(seasonResponse.data.season_number),
    rosterVersionId: roster.id,
    division,
    games: fixtures.filter((fixture) => Number(fixture.division_number) === division)
      .sort((left, right) => left.game_number - right.game_number)
      .map((fixture) => {
        const result = results.get(fixture.id)
        const contextId = contextByFixture.get(fixture.id)
        const completed = result?.player1_score !== null && result?.player1_score !== undefined && result?.player2_score !== null && result?.player2_score !== undefined
        return {
          sourceKey: fixture.id,
          gameNumber: Number(fixture.game_number),
          playerOne: names.get(fixture.player1_id) || fixture.player1_name || "Player 1",
          playerTwo: names.get(fixture.player2_id) || fixture.player2_name || "Player 2",
          course: fixture.course || "Course pending",
          state: strokeGameState({ completed, hasActiveEvidence: Boolean(contextId && evidenceByContext.has(contextId)) }),
          playerOneScore: completed ? Number(result!.player1_score) : null,
          playerTwoScore: completed ? Number(result!.player2_score) : null,
          reviewEvidenceId: contextId ? evidenceByContext.get(contextId) || null : null,
        }
      }),
    standings: standings.filter((standing) => slots.some((slot) => slot.division_number === division && slot.player_id === standing.player_id))
      .sort((left, right) => left.rank - right.rank)
      .map((standing) => ({
        rank: Number(standing.rank),
        player: names.get(standing.player_id) || "Unknown Player",
        gp: Number(standing.wins || 0) + Number(standing.losses || 0) + Number(standing.ties || 0),
        wins: Number(standing.wins || 0), losses: Number(standing.losses || 0), ties: Number(standing.ties || 0),
        strokes: Number(standing.strokes || 0), points: Number(standing.points || 0),
      })),
  }))
}

export async function enqueueStrokeBoardSync(client: SupabaseClient, seasonId: string, division: number, reason: string) {
  const response = await client.from("stroke_discord_board_sync_outbox").upsert({
    season_id: seasonId,
    division_number: division,
    reason: reason.slice(0, 120),
    sync_state: "pending",
    next_attempt_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "season_id,division_number" })
  if (response.error) throw new Error("STROKE_BOARD_SYNC_ENQUEUE_FAILED")
}
