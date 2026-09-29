"use client"

import { useEffect, useState } from "react"

import {
  courseChallengeBookName,
  type CourseChallengeDiscordGameRow,
  type CourseChallengeDiscordParticipantRow,
  type CourseChallengeGameSummary,
} from "@/lib/courseChallenges/gameHistory"

type ListedGame = CourseChallengeDiscordGameRow & {
  participants: CourseChallengeDiscordParticipantRow[]
}

type GameDetail = {
  game: CourseChallengeDiscordGameRow
  participants: CourseChallengeDiscordParticipantRow[]
  scorecards: Array<{
    scorecard_id: string
    uploaded_by_discord_user_id: string
    attachment_filename: string
    submitted_at: string
  }>
  confirmations: Array<{
    discord_user_id: string
    display_name: string
    scorecard_id: string
    confirmed_at: string
    entered_review_queue: boolean
  }>
  events: Array<{
    event_key: string
    event_type: string
    actor_discord_user_id: string | null
    subject_discord_user_id: string | null
    occurred_at: string
  }>
}

function dateTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—"
}

function statusLabel(status: string) {
  return status.toUpperCase()
}

export default function CourseChallengeGameHistory() {
  const [summary, setSummary] = useState<CourseChallengeGameSummary | null>(null)
  const [games, setGames] = useState<ListedGame[]>([])
  const [detail, setDetail] = useState<GameDetail | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    fetch("/api/admin/course-challenges/games", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || "Game history could not be loaded.")
        if (active) {
          setSummary(payload.summary)
          setGames(payload.games || [])
        }
      })
      .catch((caught) => active && setError(caught instanceof Error ? caught.message : "Game history could not be loaded."))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [])

  async function openDetail(gameId: string) {
    setError("")
    const response = await fetch(`/api/admin/course-challenges/games?id=${encodeURIComponent(gameId)}`, { cache: "no-store" })
    const payload = await response.json()
    if (!response.ok) {
      setError(payload.error || "Game details could not be loaded.")
      return
    }
    setDetail(payload)
  }

  if (loading) return <p>Loading Course Challenge game history…</p>
  if (error && !summary) return <p role="alert" style={errorStyle}>{error}</p>

  const cards = summary ? [
    ["Total games", summary.totalGames],
    ["Started", summary.startedGames],
    ["Completed", summary.completedGames],
    ["Cancelled", summary.cancelledGames],
    ["Voided", summary.voidedGames],
    ["Active", summary.activeGames],
    ["Player participations", summary.totalPlayerParticipations],
    ["Average started size", summary.averagePlayersPerStartedGame.toFixed(1)],
    ["Tourist Trap", summary.touristTrapGames],
    ["Cherry Blossom", summary.cherryBlossomGames],
  ] : []

  return <>
    {error ? <p role="alert" style={errorStyle}>{error}</p> : null}
    <section style={summaryGrid} aria-label="Game statistics">
      {cards.map(([label, value]) => <article key={String(label)} style={statCard}>
        <strong style={statValue}>{value}</strong><span>{label}</span>
      </article>)}
    </section>
    <section style={panel}>
      <h2>Game history</h2>
      {games.length === 0 ? <p>No Discord Course Challenge games have been recorded yet.</p> :
        <div style={tableWrap}><table style={table}>
          <thead><tr><th>Date</th><th>Book</th><th>Creator</th><th>Players</th><th>Started with</th><th>Room</th><th>Status</th><th>Reason</th><th /></tr></thead>
          <tbody>{games.map((game) => {
            const creator = game.participants.find((participant) => participant.original_creator)
            return <tr key={game.game_id}>
              <td>{dateTime(game.created_at)}</td>
              <td>{courseChallengeBookName(game.book_key)}</td>
              <td>{creator?.display_name || game.original_creator_discord_user_id}</td>
              <td>{game.participants.length} / {game.max_players}</td>
              <td>{game.participants.filter((participant) => participant.present_at_start).length}</td>
              <td>{game.room_name || "—"}</td>
              <td>{statusLabel(game.status)}</td>
              <td>{game.end_reason || "—"}</td>
              <td><button type="button" style={button} onClick={() => void openDetail(game.game_id)}>Details</button></td>
            </tr>
          })}</tbody>
        </table></div>}
    </section>
    {detail ? <section style={panel} aria-label="Selected game details">
      <div style={detailHeading}><h2>Game detail</h2><button type="button" style={button} onClick={() => setDetail(null)}>Close</button></div>
      <p><strong>{courseChallengeBookName(detail.game.book_key)}</strong> · {statusLabel(detail.game.status)} · created {dateTime(detail.game.created_at)}</p>
      <p>Owner: {detail.game.current_owner_discord_user_id} · Room: {detail.game.room_name || "not assigned"} · Thread: {detail.game.discord_thread_id || "—"}</p>
      <h3>Players</h3>
      <ul>{detail.participants.map((player) => <li key={player.discord_user_id}>
        <strong>{player.display_name}</strong> — joined {dateTime(player.first_joined_at)}; {player.left_at ? `left ${dateTime(player.left_at)}` : "did not leave"}; {player.present_at_start ? "present at start" : "not present at start"}; {player.confirmed_scorecard ? "confirmed a scorecard" : "not confirmed"}
      </li>)}</ul>
      <h3>Scorecards and confirmations</h3>
      {detail.scorecards.length === 0 ? <p>No scorecards were submitted.</p> : <ul>{detail.scorecards.map((scorecard) => {
        const confirmations = detail.confirmations.filter((confirmation) => confirmation.scorecard_id === scorecard.scorecard_id)
        return <li key={scorecard.scorecard_id}>
          <strong>{scorecard.attachment_filename}</strong> — uploaded by {scorecard.uploaded_by_discord_user_id} at {dateTime(scorecard.submitted_at)}
          {confirmations.length ? <ul>{confirmations.map((confirmation) => <li key={confirmation.discord_user_id}>
            {confirmation.display_name} confirmed at {dateTime(confirmation.confirmed_at)} — {confirmation.entered_review_queue ? "queued for admin review" : "not queued"}
          </li>)}</ul> : <span> — no confirmations</span>}
        </li>
      })}</ul>}
      <h3>Lifecycle</h3>
      <ol>{detail.events.map((event) => <li key={event.event_key}>
        {dateTime(event.occurred_at)} — {event.event_type.replaceAll("_", " ")}
        {event.actor_discord_user_id ? ` by ${event.actor_discord_user_id}` : ""}
        {event.subject_discord_user_id ? ` → ${event.subject_discord_user_id}` : ""}
      </li>)}</ol>
    </section> : null}
  </>
}

const summaryGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, margin: "24px 0" }
const statCard: React.CSSProperties = { border: "1px solid #334155", borderRadius: 12, padding: 16, background: "#0f172a", display: "grid", gap: 6 }
const statValue: React.CSSProperties = { fontSize: 28, color: "#c4b5fd" }
const panel: React.CSSProperties = { border: "1px solid #334155", borderRadius: 14, padding: 20, background: "#0f172a", marginTop: 18 }
const tableWrap: React.CSSProperties = { overflowX: "auto" }
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 960 }
const button: React.CSSProperties = { border: 0, borderRadius: 8, background: "#7c3aed", color: "white", padding: "8px 12px", cursor: "pointer" }
const detailHeading: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }
const errorStyle: React.CSSProperties = { color: "#fecaca", background: "#7f1d1d", padding: 12, borderRadius: 8 }
