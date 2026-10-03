"use client"

import { useEffect, useState } from "react"
import { loadProtectedAdminPlayers } from "@/lib/adminPlayersClient"

type Player = { id: string; display_name: string }
type GlobalTeam = { id: string; display_name: string; status: string; player_1_id: string; player_2_id: string }
type SeasonTeam = { id: string; season_id: string; global_team_id: string; division: string; order_position: number; team_name_snapshot: string; status: string }
type Roster = { players: Player[]; teams: GlobalTeam[]; seasonTeams: SeasonTeam[] }

export default function DoublesTeamsPage() {
  const [roster, setRoster] = useState<Roster>({ players: [], teams: [], seasonTeams: [] })
  const [name, setName] = useState(""); const [playerOne, setPlayerOne] = useState(""); const [playerTwo, setPlayerTwo] = useState("")
  const [seasonId, setSeasonId] = useState(""); const [division, setDivision] = useState(""); const [order, setOrder] = useState("1"); const [globalTeamId, setGlobalTeamId] = useState("")
  const [message, setMessage] = useState("")
  async function load() { const [response, protectedPlayers] = await Promise.all([fetch(`/api/admin/doubles/roster?season_id=${encodeURIComponent(seasonId)}`, { cache: "no-store" }), loadProtectedAdminPlayers()]); const data = await response.json() as Roster & { error?: string }; if (!response.ok) throw new Error(data.error || "Roster unavailable"); setRoster({ ...data, players: protectedPlayers.map((player) => ({ id: player.id, display_name: player.screen_name })) }) }
  // This effect synchronizes the remote admin roster when the selected season changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : "Roster unavailable")) }, [seasonId])
  async function post(body: Record<string, unknown>) { const response = await fetch("/api/admin/doubles/roster", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error || "Roster action failed"); await load(); setMessage("Saved") }
  async function createTeam() { if (!name || !playerOne || !playerTwo || playerOne === playerTwo) return setMessage("Choose a name and two distinct players."); try { await post({ action: "create_team", name, player_1_id: playerOne, player_2_id: playerTwo }); setName(""); setPlayerOne(""); setPlayerTwo("") } catch (error) { setMessage(error instanceof Error ? error.message : "Team creation failed") } }
  async function assignTeam() { if (!seasonId || !division || !globalTeamId) return setMessage("Season, dynamic division, and team are required."); try { await post({ action: "assign_season", season_id: seasonId, global_team_id: globalTeamId, division, order_position: Number(order) }) } catch (error) { setMessage(error instanceof Error ? error.message : "Season assignment failed") } }
  return <main style={shell}><h1>Canonical Doubles Teams</h1><p style={muted}>Global team identity is persistent. Season membership is scoped and replaces a player without rewriting historical team identity.</p><label>Season ID<input value={seasonId} onChange={(event) => setSeasonId(event.target.value)} placeholder="UUID from Season Manager" /></label><section style={card}><h2>Create global team</h2><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Team display name" /><select value={playerOne} onChange={(event) => setPlayerOne(event.target.value)}><option value="">Player 1</option>{roster.players.map((player) => <option key={player.id} value={player.id}>{player.display_name}</option>)}</select><select value={playerTwo} onChange={(event) => setPlayerTwo(event.target.value)}><option value="">Player 2</option>{roster.players.map((player) => <option key={player.id} value={player.id}>{player.display_name}</option>)}</select><button onClick={() => void createTeam()}>Create team</button></section><section style={card}><h2>Assign team to season</h2><input value={division} onChange={(event) => setDivision(event.target.value)} placeholder="Dynamic division/group name" /><input value={order} onChange={(event) => setOrder(event.target.value)} inputMode="numeric" placeholder="Order" /><select value={globalTeamId} onChange={(event) => setGlobalTeamId(event.target.value)}><option value="">Global team</option>{roster.teams.filter((team) => team.status === "ACTIVE").map((team) => <option key={team.id} value={team.id}>{team.display_name}</option>)}</select><button onClick={() => void assignTeam()}>Assign season team</button></section>{message && <p role="status">{message}</p>}<section style={card}><h2>Global teams</h2>{roster.teams.map((team) => <p key={team.id}><strong>{team.display_name}</strong> · {team.status}</p>)}</section><section style={card}><h2>Season teams</h2>{roster.seasonTeams.map((team) => <p key={team.id}><strong>{team.team_name_snapshot}</strong> · {team.division} · order {team.order_position} · {team.status}</p>)}</section></main>
}

const shell = { minHeight: "100vh", padding: 24, maxWidth: 1000, margin: "0 auto", color: "#f8fafc", background: "#020617" }
const card = { display: "grid", gap: 10, marginTop: 20, padding: 20, borderRadius: 14, background: "#0f172a", border: "1px solid #334155" }
const muted = { color: "#cbd5e1" }
