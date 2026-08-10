"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

type SeasonRow = { id: string; season_number: number; league_type: string | null }
type RosterRow = { id: string; division_count: number; status: "draft" | "approved" | "locked" }
type SlotRow = { player_id: string | null; player_screen_name: string | null; division_number: number; slot_number: number }
type PlayerState = { id: string; active: boolean }

export function ManagedLeaguePlayersPage({
  leagueKey,
  leagueName,
  rosterTable,
  slotTable,
}: {
  leagueKey: "stroke" | "match" | "pyp"
  leagueName: string
  rosterTable: "stroke_roster_versions" | "match_roster_versions" | "pyp_roster_versions"
  slotTable: "stroke_division_roster_slots" | "match_division_roster_slots" | "pyp_division_roster_slots"
}) {
  const [season, setSeason] = useState<SeasonRow | null>(null)
  const [roster, setRoster] = useState<RosterRow | null>(null)
  const [slots, setSlots] = useState<SlotRow[]>([])
  const [playerStates, setPlayerStates] = useState<Map<string, boolean>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    async function loadRosterPlayers() {
      const seasonId = new URLSearchParams(window.location.search).get("seasonId")?.trim()
      if (!seasonId) {
        setError(`A managed ${leagueName} seasonId is required.`)
        setLoading(false)
        return
      }

      const { data: seasonData, error: seasonError } = await supabase
        .from("seasons")
        .select("id, season_number, league_type")
        .eq("id", seasonId)
        .maybeSingle()
      if (seasonError || !seasonData || seasonData.league_type?.trim().toLowerCase() !== leagueKey) {
        setError(seasonError?.message || `The requested managed ${leagueName} season was not found.`)
        setLoading(false)
        return
      }

      const { data: rosterData, error: rosterError } = await supabase
        .from(rosterTable)
        .select("id, division_count, status")
        .eq("season_id", seasonId)
        .in("status", ["draft", "approved", "locked"])
        .order("created_at", { ascending: false })
      if (rosterError) {
        setError(`Could not load the ${leagueName} roster: ${rosterError.message}`)
        setLoading(false)
        return
      }

      const rosters = (rosterData || []) as RosterRow[]
      const selectedRoster = rosters.find((item) => item.status === "draft") || rosters.find((item) => item.status === "approved") || rosters.find((item) => item.status === "locked") || null
      if (!selectedRoster) {
        setError(`No managed ${leagueName} roster belongs to this season.`)
        setSeason(seasonData as SeasonRow)
        setLoading(false)
        return
      }

      const { data: slotData, error: slotError } = await supabase
        .from(slotTable)
        .select("player_id, player_screen_name, division_number, slot_number")
        .eq("roster_version_id", selectedRoster.id)
        .not("player_id", "is", null)
        .order("division_number", { ascending: true })
        .order("slot_number", { ascending: true })
      if (slotError) {
        setError(`Could not load the ${leagueName} roster players: ${slotError.message}`)
        setLoading(false)
        return
      }

      const loadedSlots = (slotData || []) as SlotRow[]
      const playerIds = Array.from(new Set(loadedSlots.flatMap((slot) => slot.player_id ? [slot.player_id] : [])))
      const states = new Map<string, boolean>()
      if (playerIds.length > 0) {
        const { data: playerData, error: playerError } = await supabase
          .from("players")
          .select("id, active")
          .in("id", playerIds)
        if (playerError) {
          setError(`Roster loaded, but player status could not be read: ${playerError.message}`)
        } else {
          for (const player of (playerData || []) as PlayerState[]) states.set(player.id, player.active)
        }
      }

      setSeason(seasonData as SeasonRow)
      setRoster(selectedRoster)
      setSlots(loadedSlots)
      setPlayerStates(states)
      setLoading(false)
    }

    void loadRosterPlayers()
  }, [leagueKey, leagueName, rosterTable, slotTable])

  return (
    <main style={page}>
      <div style={container}>
        <nav style={nav}>
          <Link href={`/admin/${leagueKey}${season ? `?seasonId=${encodeURIComponent(season.id)}` : ""}`} style={button}>← {leagueName} Hub</Link>
          {season && <Link href={`/admin/${leagueKey}/season/edit?seasonId=${encodeURIComponent(season.id)}`} style={button}>Edit Season</Link>}
        </nav>
        <h1 style={title}>{leagueName} Season Players</h1>
        <p style={subtitle}>{season ? `Season ${season.season_number}` : "Managed season roster"}{roster ? ` · Roster ${roster.status}` : ""}</p>

        {loading ? <p style={panel}>Loading managed roster players...</p> : error && !roster ? <p role="alert" style={errorStyle}>{error}</p> : (
          <section style={panel}>
            {error && <p role="alert" style={errorStyle}>{error}</p>}
            {slots.length === 0 ? <p style={muted}>No players are assigned to this managed roster.</p> : (
              <div style={tableWrap}>
                <table style={table}>
                  <thead><tr><th style={cell}>Player</th><th style={cell}>Division</th><th style={cell}>Slot</th><th style={cell}>Status</th><th style={cell}>Canonical player UUID</th></tr></thead>
                  <tbody>{slots.map((slot) => (
                    <tr key={`${slot.division_number}-${slot.slot_number}`}>
                      <td style={cell}><strong>{slot.player_screen_name}</strong></td>
                      <td style={cell}>{leagueName} D{slot.division_number}</td>
                      <td style={cell}>{slot.slot_number}</td>
                      <td style={cell}><span style={playerStates.get(slot.player_id || "") === false ? retiredBadge : activeBadge}>{playerStates.has(slot.player_id || "") ? (playerStates.get(slot.player_id || "") ? "ACTIVE" : "RETIRED") : "UNKNOWN"}</span></td>
                      <td style={cell}><code style={uuid}>{slot.player_id}</code></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  )
}

const page: React.CSSProperties = { minHeight: "100vh", padding: 24, background: "black", color: "white" }
const container: React.CSSProperties = { maxWidth: 1100, margin: "0 auto" }
const nav: React.CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }
const button: React.CSSProperties = { padding: "10px 14px", border: "1px solid #444", borderRadius: 8, background: "#171717", color: "white", textDecoration: "none" }
const title: React.CSSProperties = { marginBottom: 8, fontSize: 34 }
const subtitle: React.CSSProperties = { marginBottom: 24, color: "#bbb" }
const panel: React.CSSProperties = { padding: 20, border: "1px solid #333", borderRadius: 14, background: "#0e0e0e" }
const tableWrap: React.CSSProperties = { overflowX: "auto" }
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse" }
const cell: React.CSSProperties = { padding: "12px 10px", borderBottom: "1px solid #2d2d2d", textAlign: "left", verticalAlign: "middle" }
const uuid: React.CSSProperties = { color: "#aaa", fontSize: 12, whiteSpace: "nowrap" }
const muted: React.CSSProperties = { color: "#aaa" }
const activeBadge: React.CSSProperties = { display: "inline-block", padding: "4px 8px", borderRadius: 999, background: "#123d27", color: "#86efac", fontSize: 12, fontWeight: 800 }
const retiredBadge: React.CSSProperties = { ...activeBadge, background: "#3f1717", color: "#fca5a5" }
const errorStyle: React.CSSProperties = { padding: 12, borderRadius: 8, border: "1px solid #7f1d1d", background: "#260d0d", color: "#fecaca" }
