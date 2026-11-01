"use client"
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { SOLO_DIVISIONS, SOLO_DIVISION_PRESENTATION, type SoloDivision } from "@/lib/solo"

type Player = { id: string; screen_name: string; active?: boolean; status?: string | null }
type DiscordMatch = Player & { discord_id: string; already_in_pool: boolean }
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
  const [historicalEntry, setHistoricalEntry] = useState(false)
  const [season, setSeason] = useState<Season | null>(null)
  const [roster, setRoster] = useState<Roster | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [globalPlayers, setGlobalPlayers] = useState<Player[]>([])
  const [newPlayerMatches, setNewPlayerMatches] = useState<Player[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [savedFingerprint, setSavedFingerprint] = useState("[]")
  const [message, setMessage] = useState("")
  const [existingMessage, setExistingMessage] = useState("")
  const [newPlayerMessage, setNewPlayerMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [searchingExisting, setSearchingExisting] = useState(false)
  const [searchingNew, setSearchingNew] = useState(false)
  const [globalSearch, setGlobalSearch] = useState("")
  const [screenName, setScreenName] = useState("")
  const [discordId, setDiscordId] = useState("")
  const [discordMatch, setDiscordMatch] = useState<DiscordMatch | null>(null)
  const [newPlayerId, setNewPlayerId] = useState("")
  const screenNameRef = useRef<HTMLInputElement>(null)
  const existingSearchRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get("seasonId") || ""
    const historical = params.get("historical") === "1"
    setHistoricalEntry(historical)
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
    const poolPlayerQuery = poolIds.length
      ? supabase.from("players").select("id,screen_name").in("id", poolIds).order("screen_name")
      : null
    const [{ data: e, error: ee }, { data: poolPlayers, error: poolError }] = await Promise.all([
      supabase.from("solo_roster_entries").select("player_id,player_screen_name,division,display_order").eq("roster_version_id", r.id).order("display_order"),
      poolPlayerQuery
        ? historical ? poolPlayerQuery : poolPlayerQuery.eq("active", true)
        : Promise.resolve({ data: [] as Player[], error: null }),
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
    const search = globalSearch.trim()
    if (!search) {
      setGlobalPlayers([])
      setSearchingExisting(false)
      return
    }

    let cancelled = false
    setSearchingExisting(true)
    const request = historicalEntry
      ? supabase.rpc("search_solo_historical_global_players", { p_season_id: seasonId, p_search: search })
      : supabase.rpc("search_solo_existing_global_players", { p_season_id: seasonId, p_search: search })
    void request.then(({ data, error }) => {
      if (cancelled) return
      setSearchingExisting(false)
      if (error) {
        setGlobalPlayers([])
        setExistingMessage("Global Players could not be searched.")
        return
      }
      setExistingMessage("")
      setGlobalPlayers((data || []) as Player[])
    })

    return () => { cancelled = true }
  }, [globalSearch, historicalEntry, seasonId])
  useEffect(() => {
    const search = screenName.trim()
    if (!search) {
      setNewPlayerMatches([])
      setSearchingNew(false)
      return
    }
    let cancelled = false
    setSearchingNew(true)
    const request = historicalEntry
      ? supabase.rpc("search_solo_historical_global_players", { p_season_id: seasonId, p_search: search })
      : supabase.rpc("search_solo_existing_global_players", { p_season_id: seasonId, p_search: search })
    void request.then(({ data, error }) => {
      if (cancelled) return
      setSearchingNew(false)
      if (error) {
        setNewPlayerMatches([])
        setNewPlayerMessage("Global Players could not be checked for possible matches.")
        return
      }
      setNewPlayerMatches((data || []) as Player[])
    })
    return () => { cancelled = true }
  }, [screenName, historicalEntry, seasonId])
  useEffect(() => {
    const discord = discordId.trim()
    if (!/^\d{17,20}$/.test(discord)) {
      setDiscordMatch(null)
      return
    }
    let cancelled = false
    const request = historicalEntry
      ? supabase.rpc("find_solo_historical_player_by_discord_id", { p_season_id: seasonId, p_discord_id: discord })
      : supabase.rpc("find_solo_player_by_discord_id", { p_season_id: seasonId, p_discord_id: discord })
    void request.maybeSingle().then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setDiscordMatch(null)
        setNewPlayerMessage("Discord ID could not be checked.")
        return
      }
      setDiscordMatch((data as DiscordMatch | null) || null)
      if (data) setNewPlayerMessage("")
    })
    return () => { cancelled = true }
  }, [discordId, historicalEntry, seasonId])
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
  function clearNewPlayerEntry() {
    setScreenName("")
    setDiscordId("")
    setNewPlayerMatches([])
    setDiscordMatch(null)
  }
  async function addExistingPlayer(player: Player | DiscordMatch, source: "existing" | "new" = "existing") {
    if ("already_in_pool" in player && player.already_in_pool) {
      clearNewPlayerEntry()
      setNewPlayerMessage("This player is already available in Solo signed-up players.")
      requestAnimationFrame(() => screenNameRef.current?.focus())
      return
    }
    setBusy(true)
    const request = historicalEntry
      ? supabase.rpc("add_existing_player_to_solo_historical_pool", { p_season_id: seasonId, p_player_id: player.id })
      : supabase.rpc("add_existing_player_to_solo_pool", { p_season_id: seasonId, p_player_id: player.id })
    const { data, error } = await request.single()
    setBusy(false)
    if (error || !data) {
      const errorMessage = friendlyError(error?.message || "", "Player could not be added to the Solo pool.")
      if (source === "existing") setExistingMessage(errorMessage)
      else setNewPlayerMessage(errorMessage)
      return
    }
    setPlayers((current) => [...current, data as Player].sort((a, b) => a.screen_name.localeCompare(b.screen_name)))
    setNewPlayerId(player.id)
    if (source === "existing") {
      setGlobalSearch("")
      setGlobalPlayers([])
      setExistingMessage(`${player.screen_name} added to Solo signed-up players.`)
      requestAnimationFrame(() => existingSearchRef.current?.focus())
    } else {
      clearNewPlayerEntry()
      setNewPlayerMessage(`${player.screen_name} added to Solo signed-up players.`)
      requestAnimationFrame(() => screenNameRef.current?.focus())
    }
  }
  async function savePlayer() {
    const name = screenName.trim()
    const discord = discordId.trim()
    setNewPlayerMessage("")
    if (!name) return setNewPlayerMessage("Enter the player's screen name.")
    if (!/^\d{17,20}$/.test(discord)) return setNewPlayerMessage("Enter a valid numeric Discord ID.")
    if (discordMatch) return setNewPlayerMessage("Existing player found. Use the canonical player shown below.")
    setBusy(true)
    const { data, error } = await supabase.rpc("create_solo_canonical_player", { p_season_id: seasonId, p_screen_name: name, p_discord_id: discord }).single()
    setBusy(false)
    if (error || !data) {
      const normalizedError = (error?.message || "").toLowerCase()
      if (normalizedError.includes("discord") && (normalizedError.includes("already") || normalizedError.includes("duplicate") || normalizedError.includes("unique"))) {
        const request = historicalEntry
          ? supabase.rpc("find_solo_historical_player_by_discord_id", { p_season_id: seasonId, p_discord_id: discord })
          : supabase.rpc("find_solo_player_by_discord_id", { p_season_id: seasonId, p_discord_id: discord })
        const { data: existing } = await request.maybeSingle()
        if (existing) {
          setDiscordMatch(existing as DiscordMatch)
          setNewPlayerMessage("Existing player found for this Discord ID.")
          return
        }
      }
      setNewPlayerMessage(friendlyError(error?.message || "", "Player could not be created."))
      return
    }
    const player = data as Player
    setPlayers((current) => [...current.filter((item) => item.id !== player.id), player].sort((a, b) => a.screen_name.localeCompare(b.screen_name)))
    setNewPlayerId(player.id)
    clearNewPlayerEntry()
    requestAnimationFrame(() => screenNameRef.current?.focus())
    setNewPlayerMessage(`${player.screen_name} created and added to Solo signed-up players.`)
  }
  async function saveDraft() {
    if (!roster) return
    setMessage("")
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
    <label style={historicalMode}><input type="checkbox" checked={historicalEntry} onChange={(event) => { const enabled = event.target.checked; setHistoricalEntry(enabled); setGlobalPlayers([]); setNewPlayerMatches([]); setDiscordMatch(null); setExistingMessage(""); setNewPlayerMessage(""); const params = new URLSearchParams(window.location.search); if (enabled) params.set("historical", "1"); else params.delete("historical"); window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`) }} /> Historical / backlog player entry</label>
    {historicalEntry && <p style={historicalNotice}>Archived and inactive canonical players are available for this historical roster. Their current identity status will not be changed.</p>}
    {loading ? <p>Loading…</p> : roster && <><p>Roster status: <strong>{roster.status}</strong> · {entries.length} players {dirty && <strong style={{ color: "#facc15" }}>· Unsaved changes</strong>}</p>
      <div style={grid}>{SOLO_DIVISIONS.map((division) => { const presentation = SOLO_DIVISION_PRESENTATION[division]; return <section key={division} style={card}><h2 style={{ color: presentation.color }}><span role="img" aria-label={presentation.label}>{presentation.symbol}</span> {division}</h2>{entries.filter((entry) => entry.division === division).map((entry) => <div key={entry.player_id} style={row}><span>{entry.player_screen_name}</span>{roster.status === "draft" && <button style={small} onClick={() => remove(entry.player_id)}>Remove</button>}</div>)}{roster.status === "draft" && <select value="" style={selector} onChange={(event) => add(division, event.target.value)}><option value="">Solo signed-up players…</option>{players.filter((player) => !assigned.has(player.id)).map((player) => <option key={player.id} value={player.id}>{player.screen_name}{player.id === newPlayerId ? " · NEW" : ""}</option>)}</select>}</section> })}</div>
      {roster.status === "draft" && <div style={bottomActions}>
        <div style={actions}><button disabled={busy || !dirty} style={primary} onClick={saveDraft}>SAVE DRAFT</button><button disabled={busy || entries.length === 0 || dirty} style={button} onClick={approve}>APPROVE ROSTER</button></div>
        <div style={playerTools}>
          <section style={compactTool}><h3>Existing Global Player</h3>
            <input ref={existingSearchRef} style={input} placeholder="Type a screen name" value={globalSearch} onChange={(event) => { setGlobalSearch(event.target.value); setExistingMessage("") }} />
            {searchingExisting && <p style={muted}>Searching…</p>}
            {globalSearch.trim() && !searchingExisting && globalPlayers.length === 0 && <p style={muted}>No eligible matches.</p>}
            {globalPlayers.length > 0 && <div style={searchResults}>{globalPlayers.map((player) => <button key={player.id} disabled={busy} style={searchResult} onClick={() => addExistingPlayer(player)}>{player.screen_name}{historicalEntry ? ` · ${playerStatus(player)}` : ""}</button>)}</div>}
            {existingMessage && <p style={localNotice}>{existingMessage}</p>}
          </section>
          <section style={compactTool}><h3>New Player</h3>
            <label style={field}>Screen Name<input ref={screenNameRef} style={input} value={screenName} onChange={(event) => { setScreenName(event.target.value); setNewPlayerMessage("") }} /></label>
            {searchingNew && <p style={muted}>Checking…</p>}
            {newPlayerMatches.length > 0 && <div style={searchResults}>{newPlayerMatches.map((player) => <div key={player.id} style={matchRow}><span>{player.screen_name}{historicalEntry ? ` · ${playerStatus(player)}` : ""}</span><button disabled={busy} style={small} onClick={() => addExistingPlayer(player, "new")}>USE EXISTING PLAYER</button></div>)}</div>}
            <label style={field}>Discord ID<input style={input} inputMode="numeric" value={discordId} onChange={(event) => { setDiscordId(event.target.value); setNewPlayerMessage("") }} /></label>
            {discordMatch && <div style={identityMatch}><strong>EXISTING PLAYER FOUND</strong><span>Screen Name: {discordMatch.screen_name}</span>{historicalEntry && <span>Status: {playerStatus(discordMatch)}</span>}<span>Discord ID: {discordMatch.discord_id}</span>{discordMatch.already_in_pool ? <span>This player is already available in Solo signed-up players.</span> : <button disabled={busy} style={small} onClick={() => addExistingPlayer(discordMatch, "new")}>USE EXISTING PLAYER</button>}</div>}
            {newPlayerMessage && <p style={localNotice}>{newPlayerMessage}</p>}
            <button disabled={busy} style={primary} onClick={savePlayer}>SAVE PLAYER</button>
          </section>
        </div>
      </div>}
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
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 7, fontWeight: 700 }
const searchResults: React.CSSProperties = { display: "flex", flexDirection: "column", marginTop: 8, border: "1px solid #333", borderRadius: 8, overflow: "hidden" }
const searchResult: React.CSSProperties = { padding: "10px 12px", border: 0, borderBottom: "1px solid #282828", background: "#111", color: "white", textAlign: "left", cursor: "pointer" }
const bottomActions: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginTop: 20 }
const playerTools: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 12, width: "min(100%,560px)", marginLeft: "auto" }
const compactTool: React.CSSProperties = { ...card, padding: 14 }
const matchRow: React.CSSProperties = { ...row, background: "#111", padding: 9 }
const identityMatch: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 7, padding: 10, margin: "10px 0", border: "1px solid #a16207", borderRadius: 8, background: "#211704" }
const localNotice: React.CSSProperties = { padding: 9, margin: "10px 0", border: "1px solid #444", borderRadius: 8, background: "#171717" }
const historicalMode: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, width: "fit-content", marginBottom: 8, fontWeight: 800 }
const historicalNotice: React.CSSProperties = { ...localNotice, borderColor: "#a16207", color: "#fde68a" }

function playerStatus(player: Player) {
  if (player.status) return player.status.charAt(0).toUpperCase() + player.status.slice(1).toLowerCase()
  return player.active === false ? "Inactive" : "Active"
}
