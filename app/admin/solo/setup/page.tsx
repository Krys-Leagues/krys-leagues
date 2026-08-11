"use client"
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { SOLO_DIVISIONS, SOLO_DIVISION_PRESENTATION, type SoloDivision } from "@/lib/solo"

type Player = { id: string; screen_name: string }
type PoolEntry = { player_id: string }
type Entry = { player_id: string; player_screen_name: string; division: SoloDivision; display_order: number }
type Roster = { id: string; status: "draft" | "approved" | "locked" }
type Season = { season_number: number; league_type: string | null }

function rosterFingerprint(entries: Entry[]) {
  return JSON.stringify(entries.map(({ player_id, division, display_order }) => ({ player_id, division, display_order })))
}

function friendlyError(message: string, fallback: string) {
  const normalized = message.toLowerCase()
  if (normalized.includes("discord") && (normalized.includes("already") || normalized.includes("unique") || normalized.includes("duplicate"))) {
    return "Discord ID already belongs to another player."
  }
  if (normalized.includes("permission") || normalized.includes("authorization")) {
    return "You do not have permission to perform this Solo action."
  }
  return message || fallback
}

export default function SoloSetupPage() {
  const router = useRouter()
  const [seasonId, setSeasonId] = useState("")
  const [season, setSeason] = useState<Season | null>(null)
  const [roster, setRoster] = useState<Roster | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [globalPlayers, setGlobalPlayers] = useState<Player[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [savedFingerprint, setSavedFingerprint] = useState("[]")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [searching, setSearching] = useState(false)
  const [playerSource, setPlayerSource] = useState<"existing" | "new" | null>(null)
  const [globalSearch, setGlobalSearch] = useState("")
  const [screenName, setScreenName] = useState("")
  const [discordId, setDiscordId] = useState("")
  const [newPlayerId, setNewPlayerId] = useState("")

  const load = useCallback(async () => {
    const id = new URLSearchParams(window.location.search).get("seasonId") || ""
    setSeasonId(id)
    if (!id) {
      setMessage("A seasonId is required. No fallback season was loaded.")
      setLoading(false)
      return
    }
    const [{ data: s, error: se }, { data: r, error: re }, { data: p, error: pe }] = await Promise.all([
      supabase.from("seasons").select("season_number,league_type").eq("id", id).maybeSingle(),
      supabase.from("solo_roster_versions").select("id,status").eq("season_id", id).in("status", ["draft", "approved", "locked"]).order("version_number", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("solo_player_pool").select("player_id").eq("season_id", id),
    ])
    if (se || re || pe || !s || s.league_type !== "solo" || !r) {
      setMessage(se?.message || re?.message || pe?.message || "Managed Solo season setup was not found.")
      setLoading(false)
      return
    }
    const poolIds = ((p || []) as PoolEntry[]).map((entry) => entry.player_id)
    const [{ data: e, error: ee }, { data: poolPlayers, error: poolError }] = await Promise.all([
      supabase.from("solo_roster_entries").select("player_id,player_screen_name,division,display_order").eq("roster_version_id", r.id).order("display_order"),
      poolIds.length ? supabase.from("players").select("id,screen_name").in("id", poolIds).eq("active", true).order("screen_name") : Promise.resolve({ data: [] as Player[], error: null }),
    ])
    if (ee || poolError) {
      setMessage(ee?.message || poolError?.message || "Solo player pool could not be loaded.")
      setLoading(false)
      return
    }
    const loadedEntries = (e || []) as Entry[]
    setSeason(s as Season)
    setRoster(r as Roster)
    setPlayers((poolPlayers || []) as Player[])
    setEntries(loadedEntries)
    setSavedFingerprint(rosterFingerprint(loadedEntries))
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (playerSource !== "existing") return
    const search = globalSearch.trim()
    if (!search) {
      setGlobalPlayers([])
      setSearching(false)
      return
    }

    let cancelled = false
    setSearching(true)
    void supabase.from("players").select("id,screen_name").eq("active", true).ilike("screen_name", `%${search}%`).order("screen_name").limit(20).then(({ data, error }) => {
      if (cancelled) return
      setSearching(false)
      if (error) {
        setGlobalPlayers([])
        setMessage("Global Players could not be searched.")
        return
      }
      const poolIds = new Set(players.map((player) => player.id))
      setGlobalPlayers(((data || []) as Player[]).filter((player) => !poolIds.has(player.id)))
    })

    return () => { cancelled = true }
  }, [globalSearch, playerSource, players])
  const dirty = roster?.status === "draft" && rosterFingerprint(entries) !== savedFingerprint
  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (!dirty) return
      event.preventDefault()
      event.returnValue = "You have unsaved Solo roster changes."
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const assigned = useMemo(() => new Set(entries.map((entry) => entry.player_id)), [entries])
  function add(division: SoloDivision, playerId: string) {
    const player = players.find((candidate) => candidate.id === playerId)
    if (!player || assigned.has(playerId)) return
    setEntries((current) => [...current, { player_id: player.id, player_screen_name: player.screen_name, division, display_order: current.filter((entry) => entry.division === division).length + 1 }])
  }
  function remove(playerId: string) {
    setEntries((current) => current.filter((entry) => entry.player_id !== playerId).map((entry, index, remaining) => ({ ...entry, display_order: remaining.filter((candidate) => candidate.division === entry.division).findIndex((candidate) => candidate.player_id === entry.player_id) + 1 || index + 1 })))
  }
  function navigate(href: string) {
    if (dirty && !window.confirm("You have unsaved Solo roster changes. Leave without saving?")) return
    router.push(href)
  }
  function closePlayerSource() {
    setPlayerSource(null)
    setGlobalSearch("")
    setGlobalPlayers([])
    setSearching(false)
  }
  async function addExistingPlayer(player: Player) {
    setBusy(true)
    const { data, error } = await supabase.rpc("add_existing_player_to_solo_pool", { p_season_id: seasonId, p_player_id: player.id }).single()
    setBusy(false)
    if (error || !data) return setMessage(friendlyError(error?.message || "", "Player could not be added to the Solo pool."))
    setPlayers((current) => [...current, data as Player].sort((a, b) => a.screen_name.localeCompare(b.screen_name)))
    setNewPlayerId(player.id)
    closePlayerSource()
    setMessage(`${player.screen_name} is now available in the Solo division selectors.`)
  }
  async function savePlayer() {
    const name = screenName.trim()
    const discord = discordId.trim()
    if (!name) return setMessage("Enter the player's screen name.")
    if (!/^\d{17,20}$/.test(discord)) return setMessage("Enter a valid numeric Discord ID.")
    setBusy(true)
    const { data, error } = await supabase.rpc("create_solo_canonical_player", { p_season_id: seasonId, p_screen_name: name, p_discord_id: discord }).single()
    setBusy(false)
    if (error || !data) {
      setMessage(friendlyError(error?.message || "", "Player could not be created."))
      return
    }
    const player = data as Player
    setPlayers((current) => [...current.filter((item) => item.id !== player.id), player].sort((a, b) => a.screen_name.localeCompare(b.screen_name)))
    setNewPlayerId(player.id)
    setScreenName("")
    setDiscordId("")
    closePlayerSource()
    setMessage(`${player.screen_name} was saved globally, added to this Solo season's pool, and is ready to assign.`)
  }
  async function saveDraft() {
    if (!roster) return
    setBusy(true)
    const payload = entries.map(({ player_id, division, display_order }) => ({ player_id, division, display_order }))
    const { error } = await supabase.rpc("save_solo_roster", { p_roster_version_id: roster.id, p_entries: payload })
    setBusy(false)
    if (error) return setMessage(friendlyError(error.message, "Solo roster draft could not be saved."))
    setSavedFingerprint(rosterFingerprint(entries))
    setMessage("Draft Solo roster saved.")
  }
  async function approve() {
    if (!roster) return
    if (dirty) return setMessage("Save the Solo roster draft before approving it.")
    setBusy(true)
    const { error } = await supabase.rpc("approve_solo_roster_version", { p_roster_version_id: roster.id, p_approval_note: null })
    setBusy(false)
    setMessage(error ? friendlyError(error.message, "Solo roster could not be approved.") : "Solo roster approved.")
    if (!error) await load()
  }

  return <main style={page}><div style={container}>
    <div style={nav}><button style={button} onClick={() => navigate(`/admin/solo?seasonId=${encodeURIComponent(seasonId)}`)}>← Solo Hub</button><button style={button} onClick={() => navigate(`/admin/solo/weeks?seasonId=${encodeURIComponent(seasonId)}`)} disabled={!seasonId}>Weeks →</button></div>
    <h1>Solo Setup / Roster</h1><p style={muted}>{season ? `Season ${season.season_number}` : "Load the exact managed Solo season."}</p>
    {loading ? <p>Loading…</p> : roster && <><p>Roster status: <strong>{roster.status}</strong> · {entries.length} players {dirty && <strong style={{ color: "#facc15" }}>· Unsaved changes</strong>}</p>
      {roster.status === "draft" && playerSource && <section style={addPanel}>{playerSource === "existing" ? <><h2>Add Existing Global Player</h2><div style={sourceRow}><input style={input} autoFocus placeholder="Type a screen name" value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} /><button disabled={busy} style={button} onClick={closePlayerSource}>CANCEL</button></div>{searching && <p style={muted}>Searching…</p>}{globalSearch.trim() && !searching && globalPlayers.length === 0 && <p style={muted}>No matching Global Players outside this Solo pool.</p>}{globalPlayers.length > 0 && <div style={searchResults}>{globalPlayers.map((player) => <button key={player.id} disabled={busy} style={searchResult} onClick={() => addExistingPlayer(player)}>{player.screen_name}</button>)}</div>}</> : <><h2>Add New Player</h2><div style={addForm}><label style={field}>Screen Name<input style={input} value={screenName} onChange={(event) => setScreenName(event.target.value)} /></label><label style={field}>Discord ID<input style={input} inputMode="numeric" value={discordId} onChange={(event) => setDiscordId(event.target.value)} /></label><div style={actions}><button disabled={busy} style={primary} onClick={savePlayer}>SAVE PLAYER</button><button disabled={busy} style={button} onClick={closePlayerSource}>CANCEL</button></div></div></>}</section>}
      <div style={grid}>{SOLO_DIVISIONS.map((division) => { const presentation = SOLO_DIVISION_PRESENTATION[division]; return <section key={division} style={card}><h2 style={{ color: presentation.color }}><span role="img" aria-label={presentation.label}>{presentation.symbol}</span> {division}</h2>{entries.filter((entry) => entry.division === division).map((entry) => <div key={entry.player_id} style={row}><span>{entry.player_screen_name}</span>{roster.status === "draft" && <button style={small} onClick={() => remove(entry.player_id)}>Remove</button>}</div>)}{roster.status === "draft" && <select value="" style={selector} onChange={(event) => add(division, event.target.value)}><option value="">Solo signed-up players…</option>{players.filter((player) => !assigned.has(player.id)).map((player) => <option key={player.id} value={player.id}>{player.screen_name}{player.id === newPlayerId ? " · NEW" : ""}</option>)}</select>}</section> })}</div>
      {roster.status === "draft" && <div style={bottomActions}><div style={actions}><button disabled={busy || !dirty} style={primary} onClick={saveDraft}>SAVE DRAFT</button><button disabled={busy || entries.length === 0 || dirty} style={button} onClick={approve}>APPROVE ROSTER</button></div><div style={playerActions}><button style={button} onClick={() => { setPlayerSource("existing"); setGlobalSearch(""); setGlobalPlayers([]) }}>Add Existing Global Player</button><button style={button} onClick={() => setPlayerSource("new")}>Add New Player to Solo Players</button></div></div>}
    </>}
    {message && <p style={notice}>{message}</p>}
  </div></main>
}

const page: React.CSSProperties = { minHeight: "100vh", padding: 24, background: "black", color: "white" }
const container: React.CSSProperties = { maxWidth: 1150, margin: "0 auto" }
const nav: React.CSSProperties = { display: "flex", gap: 10 }
const muted: React.CSSProperties = { color: "#bbb" }
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 14 }
const card: React.CSSProperties = { padding: 16, border: "1px solid #333", borderRadius: 12, background: "#0d0d0d" }
const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "7px 0" }
const input: React.CSSProperties = { padding: 10, border: "1px solid #444", borderRadius: 8, background: "#111", color: "white" }
const selector: React.CSSProperties = { ...input, width: "100%", marginTop: 12 }
const button: React.CSSProperties = { padding: "9px 12px", border: "1px solid #555", borderRadius: 8, background: "#171717", color: "white" }
const small: React.CSSProperties = { ...button, padding: "4px 7px" }
const primary: React.CSSProperties = { ...button, background: "#126b3c", borderColor: "#167a45", fontWeight: 800 }
const actions: React.CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }
const notice: React.CSSProperties = { padding: 12, border: "1px solid #555", borderRadius: 8, background: "#171717" }
const addPanel: React.CSSProperties = { ...card, marginBottom: 16 }
const addForm: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginTop: 14 }
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 7, fontWeight: 700 }
const sourceRow: React.CSSProperties = { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }
const searchResults: React.CSSProperties = { display: "flex", flexDirection: "column", marginTop: 8, border: "1px solid #333", borderRadius: 8, overflow: "hidden" }
const searchResult: React.CSSProperties = { padding: "10px 12px", border: 0, borderBottom: "1px solid #282828", background: "#111", color: "white", textAlign: "left", cursor: "pointer" }
const bottomActions: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginTop: 20 }
const playerActions: React.CSSProperties = { display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap", marginLeft: "auto" }
