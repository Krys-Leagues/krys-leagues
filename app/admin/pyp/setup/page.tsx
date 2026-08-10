"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type Slot = { slot_number: number; player_id: string | null; player_screen_name: string | null }
type Player = { id: string; screen_name: string }
type Season = { season_number: number; start_date: string | null; end_date: string | null; league_type: string | null }
type Roster = { id: string; division_count: number; status: "draft" | "approved" | "locked" }

const themes: Record<number, { accent: string; border: string; background: string }> = {
  1: { accent: "#fb923c", border: "#9a3412", background: "rgba(124,45,18,.18)" },
  2: { accent: "#4ade80", border: "#15803d", background: "rgba(20,83,45,.18)" },
  3: { accent: "#60a5fa", border: "#1d4ed8", background: "rgba(30,64,175,.16)" },
  4: { accent: "#facc15", border: "#a16207", background: "rgba(113,63,18,.18)" },
  5: { accent: "#c084fc", border: "#7e22ce", background: "rgba(88,28,135,.18)" },
}
const neutralTheme = { accent: "#ddd", border: "#444", background: "#0b0b0b" }

export default function PypSetupPage() {
  const router = useRouter()
  const [seasonId, setSeasonId] = useState("")
  const [season, setSeason] = useState<Season | null>(null)
  const [division, setDivision] = useState(1)
  const [rosterId, setRosterId] = useState("")
  const [divisionCount, setDivisionCount] = useState(1)
  const [rosterStatus, setRosterStatus] = useState<Roster["status"]>("draft")
  const [slotPlayerIds, setSlotPlayerIds] = useState<(string | null)[]>([null, null, null, null])
  const [loadedSlotPlayerIds, setLoadedSlotPlayerIds] = useState<(string | null)[]>([null, null, null, null])
  const [players, setPlayers] = useState<Player[]>([])
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const dirty = slotPlayerIds.some((playerId, index) => playerId !== loadedSlotPlayerIds[index])
  const theme = themes[division] || neutralTheme

  const load = useCallback(async (seasonIdOverride?: string, divisionOverride?: number) => {
    setLoading(true)
    setMessage("")
    setSlotPlayerIds([null, null, null, null])
    setLoadedSlotPlayerIds([null, null, null, null])
    const params = new URLSearchParams(window.location.search)
    const selectedSeasonId = seasonIdOverride || params.get("seasonId") || ""
    const requestedDivision = divisionOverride ?? Number(params.get("division"))
    if (!selectedSeasonId || !Number.isInteger(requestedDivision) || requestedDivision < 1) {
      setMessage("A valid seasonId and division are required.")
      setLoading(false)
      return
    }

    const { data: seasonData, error: seasonError } = await supabase
      .from("seasons")
      .select("season_number, start_date, end_date, league_type")
      .eq("id", selectedSeasonId)
      .maybeSingle()
    if (seasonError || !seasonData || seasonData.league_type !== "pyp") {
      setMessage(seasonError?.message || "Managed PYP season not found.")
      setLoading(false)
      return
    }

    const { data: rosterData, error: rosterError } = await supabase
      .from("pyp_roster_versions")
      .select("id, division_count, status")
      .eq("season_id", selectedSeasonId)
      .in("status", ["draft", "approved", "locked"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (rosterError || !rosterData) {
      setMessage(rosterError?.message || "PYP roster not found.")
      setLoading(false)
      return
    }

    const roster = rosterData as Roster
    if (requestedDivision > roster.division_count) {
      setMessage(`Division must be between 1 and ${roster.division_count}.`)
      setLoading(false)
      return
    }

    const { data: slotData, error: slotError } = await supabase
      .from("pyp_division_roster_slots")
      .select("slot_number, player_id, player_screen_name")
      .eq("roster_version_id", roster.id)
      .eq("division_number", requestedDivision)
      .order("slot_number")
    const slots = (slotData || []) as Slot[]
    if (slotError || slots.length !== 4 || slots.some((slot, index) => slot.slot_number !== index + 1)) {
      setMessage(slotError?.message || "Exactly four persistent roster slots were not found.")
      setLoading(false)
      return
    }

    const selectedIds = slots.map((slot) => slot.player_id).filter((id): id is string => Boolean(id))
    const [{ data: activePlayers, error: activeError }, rosterPlayersResult] = await Promise.all([
      supabase.from("players").select("id, screen_name").eq("active", true).order("screen_name"),
      selectedIds.length > 0
        ? supabase.from("players").select("id, screen_name").in("id", selectedIds)
        : Promise.resolve({ data: [] as Player[], error: null }),
    ])
    if (activeError || rosterPlayersResult.error) {
      setMessage(activeError?.message || rosterPlayersResult.error?.message || "Could not load players.")
      setLoading(false)
      return
    }

    const playerMap = new Map<string, Player>()
    for (const player of [...((activePlayers || []) as Player[]), ...((rosterPlayersResult.data || []) as Player[])]) playerMap.set(player.id, player)
    setPlayers(Array.from(playerMap.values()).sort((a, b) => a.screen_name.localeCompare(b.screen_name)))
    setSeasonId(selectedSeasonId)
    setSeason(seasonData as Season)
    setDivision(requestedDivision)
    setRosterId(roster.id)
    setDivisionCount(roster.division_count)
    setRosterStatus(roster.status)
    setSlotPlayerIds(slots.map((slot) => slot.player_id))
    setLoadedSlotPlayerIds(slots.map((slot) => slot.player_id))
    setLoading(false)
  }, [])

  // Load the URL-scoped context initially and whenever browser history changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    function reloadFromBrowserNavigation() {
      if (dirty && !window.confirm("You have unsaved roster changes. Leave without saving them?")) {
        window.history.go(1)
        return
      }
      void load()
    }
    window.addEventListener("popstate", reloadFromBrowserNavigation)
    return () => window.removeEventListener("popstate", reloadFromBrowserNavigation)
  }, [dirty, load])
  useEffect(() => {
    function warn(event: BeforeUnloadEvent) { if (dirty) event.preventDefault() }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  function navigate(href: string) {
    if (dirty && !window.confirm("You have unsaved roster changes. Leave without saving them?")) return
    router.push(href)
  }

  function goDivision(next: number) {
    if (loading || next < 1 || next > divisionCount || next === division) return
    if (dirty && !window.confirm("You have unsaved roster changes. Leave without saving them?")) return
    router.push(`/admin/pyp/setup?seasonId=${encodeURIComponent(seasonId)}&division=${next}`)
    void load(seasonId, next)
  }

  async function saveRoster() {
    setBusy(true)
    setMessage("")
    const { data, error } = await supabase.rpc("set_pyp_division_roster_slots", {
      p_roster_version_id: rosterId,
      p_division_number: division,
      p_slot1_player_id: slotPlayerIds[0],
      p_slot2_player_id: slotPlayerIds[1],
      p_slot3_player_id: slotPlayerIds[2],
      p_slot4_player_id: slotPlayerIds[3],
    })
    setBusy(false)
    if (error) {
      setMessage(error.message)
      return
    }
    const saved = ((data || []) as Slot[]).sort((a, b) => a.slot_number - b.slot_number)
    const authoritative = saved.length === 4 ? saved.map((slot) => slot.player_id) : slotPlayerIds
    setSlotPlayerIds(authoritative)
    setLoadedSlotPlayerIds(authoritative)
    setMessage("Division roster saved.")
    if (division < divisionCount) {
      const nextDivision = division + 1
      router.push(`/admin/pyp/setup?seasonId=${encodeURIComponent(seasonId)}&division=${nextDivision}`)
      await load(seasonId, nextDivision)
    }
  }

  async function approveRoster() {
    if (dirty) {
      setMessage("Save the current division roster before approval.")
      return
    }
    setBusy(true)
    setMessage("")
    const { error } = await supabase.rpc("approve_pyp_roster_version", { p_roster_version_id: rosterId, p_approval_note: null })
    setBusy(false)
    if (error) setMessage(error.message)
    else {
      setRosterStatus("approved")
      setMessage("PYP roster approved. Schedule generation is now available.")
    }
  }

  const divisionButtons = useMemo(() => Array.from({ length: divisionCount }, (_, index) => index + 1), [divisionCount])

  return (
    <main style={page}>
      <div style={container}>
        <div style={topBar}>
          <button type="button" onClick={() => navigate("/admin/pyp")} style={secondaryButton}>← PYP Hub</button>
          <button type="button" onClick={() => navigate(`/admin/pyp/season/edit?seasonId=${encodeURIComponent(seasonId)}`)} style={secondaryButton}>Back to Season</button>
          <button type="button" onClick={() => navigate(`/admin/pyp/schedule?seasonId=${encodeURIComponent(seasonId)}`)} style={secondaryButton} disabled={!seasonId}>View Schedule</button>
        </div>
        <h1 style={title}>PYP Setup</h1>
        <p style={subtitle}>{season ? `Season ${season.season_number} · ${season.start_date || "Date not set"} through ${season.end_date || "Date not set"}` : "Load a managed PYP season roster."}</p>

        {loading ? <p>Loading PYP roster...</p> : (
          <section style={{ ...divisionCard, borderColor: theme.border, background: theme.background }}>
            <div style={divisionHeader}>
              <div><span style={{ ...divisionBadge, color: theme.accent, borderColor: theme.border }}>PYP D{division}</span><h2 style={sectionTitle}>Division Roster</h2></div>
              <span style={statusPill}>Roster: {rosterStatus}</span>
            </div>

            <div style={divisionTabs}>{divisionButtons.map((number) => <button type="button" key={number} onClick={() => goDivision(number)} disabled={number === division} style={number === division ? { ...divisionButton, borderColor: theme.accent, color: theme.accent } : divisionButton}>D{number}</button>)}</div>

            <div style={slotGrid}>
              {slotPlayerIds.map((playerId, index) => (
                <label key={index} style={field}>
                  <span style={labelStyle}>Slot {index + 1}</span>
                  <select value={playerId || ""} disabled={rosterStatus === "locked" || busy} style={input} onChange={(event) => setSlotPlayerIds((current) => current.map((value, slotIndex) => slotIndex === index ? (event.target.value || null) : value))}>
                    <option value="">EMPTY</option>
                    {players.map((player) => <option key={player.id} value={player.id} disabled={slotPlayerIds.some((selectedId, slotIndex) => slotIndex !== index && selectedId === player.id)}>{player.screen_name}</option>)}
                  </select>
                </label>
              ))}
            </div>

            <div style={rosterActions}>
              <button type="button" disabled={busy || rosterStatus === "locked"} onClick={saveRoster} style={primaryButton}>{busy ? "Saving..." : "Save Division Roster"}</button>
              {rosterStatus === "draft" && <button type="button" disabled={busy || dirty} onClick={approveRoster} style={secondaryButton}>Approve Roster</button>}
            </div>

            <div style={bottomNavigation}>
              <div>{division > 1 && <button type="button" onClick={() => goDivision(division - 1)} style={secondaryButton}>← PYP D{division - 1}</button>}</div>
              <div style={actions}><button type="button" onClick={() => navigate(`/admin/pyp/season/edit?seasonId=${encodeURIComponent(seasonId)}`)} style={secondaryButton}>Back to Season</button><button type="button" onClick={() => navigate(`/admin/pyp/schedule?seasonId=${encodeURIComponent(seasonId)}`)} style={secondaryButton}>View Schedule</button></div>
              <div>{division < divisionCount && <button type="button" onClick={() => goDivision(division + 1)} style={secondaryButton}>PYP D{division + 1} →</button>}</div>
            </div>
          </section>
        )}
        {message && <p style={messageStyle}>{message}</p>}
      </div>
    </main>
  )
}

const page: React.CSSProperties = { minHeight: "100vh", padding: 24, background: "black", color: "white" }
const container: React.CSSProperties = { maxWidth: 1050, margin: "0 auto" }
const topBar: React.CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }
const title: React.CSSProperties = { fontSize: 34, marginBottom: 8 }
const subtitle: React.CSSProperties = { color: "#bbb", marginBottom: 24 }
const divisionCard: React.CSSProperties = { padding: 24, border: "2px solid", borderRadius: 16 }
const divisionHeader: React.CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }
const divisionBadge: React.CSSProperties = { display: "inline-flex", padding: "7px 12px", border: "1px solid", borderRadius: 999, fontSize: 16, fontWeight: 900 }
const sectionTitle: React.CSSProperties = { margin: "12px 0 0" }
const statusPill: React.CSSProperties = { padding: "7px 11px", borderRadius: 999, border: "1px solid #555", background: "rgba(0,0,0,.35)", color: "#ddd", fontWeight: 800, textTransform: "capitalize" }
const divisionTabs: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, margin: "22px 0" }
const divisionButton: React.CSSProperties = { minWidth: 44, padding: "8px 10px", borderRadius: 8, border: "1px solid #444", background: "#111", color: "white", cursor: "pointer" }
const slotGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(220px, 1fr))", gap: 16 }
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8 }
const labelStyle: React.CSSProperties = { color: "#ddd", fontWeight: 800 }
const input: React.CSSProperties = { boxSizing: "border-box", width: "100%", padding: 12, background: "#111", border: "1px solid #444", color: "white", borderRadius: 8 }
const actions: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 10 }
const rosterActions: React.CSSProperties = { ...actions, marginTop: 22 }
const bottomNavigation: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12, marginTop: 24 }
const primaryButton: React.CSSProperties = { padding: "12px 18px", borderRadius: 8, border: "1px solid #167a45", background: "#126b3c", color: "white", fontWeight: 800, cursor: "pointer" }
const secondaryButton: React.CSSProperties = { padding: "10px 14px", borderRadius: 8, border: "1px solid #555", background: "#171717", color: "white", cursor: "pointer" }
const messageStyle: React.CSSProperties = { marginTop: 16, padding: 12, borderRadius: 8, border: "1px solid #444", background: "#171717" }
