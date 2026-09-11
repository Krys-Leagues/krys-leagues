"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

type Membership = {
  id: string
  player_id: string | null
  league_type: string
  season_number: number
  division: string
  screen_name: string | null
  status: string | null
  active: boolean | null
}

type DirectoryPlayer = {
  id: string
  screen_name: string
  aliases: string[]
}

const DIVISIONS: Record<string, string[]> = {
  stroke: ["Stroke D1", "Stroke D2", "Stroke D3", "Stroke D4", "Stroke D5"],
  match: ["Match D1", "Match D2", "Match D3", "Match D4", "Match D5"],
  pyp: ["PYP D1", "PYP D2", "PYP D3", "PYP D4", "PYP D5"],
  pro: ["Pro D1", "Pro D2", "Pro D3", "Semi Pro D1", "Amateur D1"],
  doubles: ["Doubles Elite", "Doubles D1", "Doubles D2", "Doubles D3", "Doubles D4", "Doubles D5"],
  kwt: ["Amateur", "Semi Pro", "Pro", "Elite"],
  skins: ["Skins D1", "Skins D2", "Skins D3", "Skins D4", "Skins D5"],
  monthly: ["Monthlies"],
}

type Props = {
  leagueType: string
  leagueName: string
}

export default function LeaguePlayersPage({ leagueType, leagueName }: Props) {
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [seasonNumber, setSeasonNumber] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState("")
  const [directory, setDirectory] = useState<DirectoryPlayer[]>([])
  const [selectedPlayer, setSelectedPlayer] = useState<DirectoryPlayer | null>(null)
  const [division, setDivision] = useState(DIVISIONS[leagueType]?.[0] || "")
  const [busy, setBusy] = useState(false)

  const enrolledIds = useMemo(() => new Set(memberships.map((membership) => membership.player_id).filter(Boolean)), [memberships])
  const availableDirectory = directory.filter((player) => !enrolledIds.has(player.id))

  const loadMembers = useCallback(async () => {
    setLoading(true)
    setError("")
    const response = await fetch(`/api/admin/league-memberships?league_type=${encodeURIComponent(leagueType)}`, { cache: "no-store", credentials: "same-origin" })
    const payload = await response.json() as { error?: string; memberships?: Membership[]; season_number?: number | null }
    setLoading(false)
    if (!response.ok) {
      setError(payload.error || "League players could not be loaded.")
      return
    }
    setMemberships(payload.memberships || [])
    setSeasonNumber(payload.season_number ?? null)
  }, [leagueType])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadMembers() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadMembers])

  async function searchDirectory() {
    if (search.trim().length < 2) {
      setDirectory([])
      return
    }
    const response = await fetch(`/api/admin/league-memberships?mode=directory&league_type=${encodeURIComponent(leagueType)}&q=${encodeURIComponent(search.trim())}`, { cache: "no-store", credentials: "same-origin" })
    const payload = await response.json() as { error?: string; players?: DirectoryPlayer[] }
    if (!response.ok) {
      setError(payload.error || "Global player search could not be loaded.")
      return
    }
    setDirectory(payload.players || [])
  }

  async function addPlayer() {
    if (!selectedPlayer || !seasonNumber || !division) return
    setBusy(true)
    const response = await fetch("/api/admin/league-memberships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "add", player_id: selectedPlayer.id, league_type: leagueType, season_number: seasonNumber, division }),
    })
    const payload = await response.json() as { error?: string }
    setBusy(false)
    if (!response.ok) {
      setError(payload.error || "Player could not be enrolled.")
      return
    }
    setSelectedPlayer(null)
    setSearch("")
    setDirectory([])
    setShowAdd(false)
    await loadMembers()
  }

  async function removePlayer(membership: Membership) {
    if (!window.confirm(`Remove ${membership.screen_name || "this player"} from ${leagueName}? This preserves global identity and history.`)) return
    setBusy(true)
    const response = await fetch("/api/admin/league-memberships", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ membership_id: membership.id }),
    })
    const payload = await response.json() as { error?: string }
    setBusy(false)
    if (!response.ok) {
      setError(payload.error || "Player could not be removed.")
      return
    }
    await loadMembers()
  }

  return (
    <main style={page}>
      <div style={shell}>
        <h1 style={title}>{leagueName} Players</h1>
        <p style={subtitle}>Only players enrolled in the current {leagueName} membership are shown here.</p>

        <div style={toolbar}>
          <div>
            <strong>{seasonNumber ? `Season ${seasonNumber}` : "No current season"}</strong>
            <span style={muted}> · {memberships.length} enrolled</span>
          </div>
          <button type="button" onClick={() => setShowAdd(true)} disabled={!seasonNumber || busy} style={primaryButton}>Add Player</button>
        </div>

        {error && <p style={errorText}>{error}</p>}
        {loading ? <p>Loading enrolled players...</p> : memberships.length === 0 ? <p style={empty}>No players are enrolled in this league for the current season.</p> : (
          <div style={tableWrap}>
            <table style={table}>
              <thead><tr><th style={th}>Player</th><th style={th}>Division</th><th style={th}>Status</th><th style={th}>Actions</th></tr></thead>
              <tbody>{memberships.map((membership) => (
                <tr key={membership.id}>
                  <td style={td}>{membership.screen_name || membership.player_id || "Unknown player"}</td>
                  <td style={td}>{membership.division}</td>
                  <td style={td}>{membership.status || (membership.active === false ? "inactive" : "active")}</td>
                  <td style={td}><button type="button" onClick={() => void removePlayer(membership)} disabled={busy} style={removeButton}>Remove Player</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {showAdd && (
          <div style={overlay} role="dialog" aria-modal="true" aria-label={`Add player to ${leagueName}`}>
            <div style={modal}>
              <h2>Add Player to {leagueName}</h2>
              <p style={muted}>Search the canonical Global Players directory by current name or approved alias.</p>
              <div style={searchRow}>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search player or approved alias" style={input} />
                <button type="button" onClick={() => void searchDirectory()} style={secondaryButton}>Search</button>
              </div>
              <label style={label}>Division<select value={division} onChange={(event) => setDivision(event.target.value)} style={input}>{(DIVISIONS[leagueType] || []).map((value) => <option key={value}>{value}</option>)}</select></label>
              <div style={results}>{availableDirectory.map((player) => <button type="button" key={player.id} onClick={() => setSelectedPlayer(player)} style={selectedPlayer?.id === player.id ? selectedResult : result}><strong>{player.screen_name}</strong>{player.aliases.length > 0 && <span style={muted}>Also known as: {player.aliases.join(", ")}</span>}</button>)}</div>
              <div style={modalActions}><button type="button" onClick={() => setShowAdd(false)} style={secondaryButton}>Cancel</button><button type="button" onClick={() => void addPlayer()} disabled={!selectedPlayer || busy} style={primaryButton}>{busy ? "Saving..." : "Enroll Player"}</button></div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

const page: React.CSSProperties = { minHeight: "100vh", padding: 24, background: "black", color: "white" }
const shell: React.CSSProperties = { maxWidth: 1100, margin: "0 auto" }
const title: React.CSSProperties = { fontSize: 34, marginBottom: 8 }
const subtitle: React.CSSProperties = { color: "#aaa", marginBottom: 24 }
const toolbar: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 18 }
const muted: React.CSSProperties = { color: "#aaa", display: "block" }
const primaryButton: React.CSSProperties = { background: "#22c55e", border: 0, borderRadius: 8, color: "white", cursor: "pointer", padding: "10px 14px", fontWeight: 800 }
const secondaryButton: React.CSSProperties = { background: "#1f2937", border: "1px solid #4b5563", borderRadius: 8, color: "white", cursor: "pointer", padding: "10px 14px", fontWeight: 700 }
const removeButton: React.CSSProperties = { ...secondaryButton, color: "#fecaca", borderColor: "#7f1d1d" }
const errorText: React.CSSProperties = { color: "#fca5a5", padding: 12, border: "1px solid #7f1d1d", borderRadius: 8 }
const empty: React.CSSProperties = { color: "#aaa", padding: 24, border: "1px dashed #555", borderRadius: 10 }
const tableWrap: React.CSSProperties = { overflowX: "auto", border: "1px solid #333", borderRadius: 10 }
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse" }
const th: React.CSSProperties = { textAlign: "left", padding: 12, borderBottom: "1px solid #333", color: "#aaa" }
const td: React.CSSProperties = { padding: 12, borderBottom: "1px solid #222" }
const overlay: React.CSSProperties = { position: "fixed", inset: 0, display: "grid", placeItems: "center", background: "rgba(0,0,0,.72)", padding: 20, zIndex: 20 }
const modal: React.CSSProperties = { width: "min(620px, 100%)", maxHeight: "90vh", overflowY: "auto", background: "#111", border: "1px solid #444", borderRadius: 14, padding: 20 }
const searchRow: React.CSSProperties = { display: "flex", gap: 8, margin: "18px 0" }
const input: React.CSSProperties = { width: "100%", background: "#050505", color: "white", border: "1px solid #555", borderRadius: 8, padding: 10 }
const label: React.CSSProperties = { display: "grid", gap: 8, marginBottom: 14, fontWeight: 700 }
const results: React.CSSProperties = { display: "grid", gap: 8, marginTop: 14 }
const result: React.CSSProperties = { display: "grid", gap: 3, textAlign: "left", background: "#171717", border: "1px solid #333", color: "white", borderRadius: 8, padding: 10, cursor: "pointer" }
const selectedResult: React.CSSProperties = { ...result, borderColor: "#22c55e", background: "#12351f" }
const modalActions: React.CSSProperties = { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }
