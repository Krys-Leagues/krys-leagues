"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ManagedSeasonDangerZone } from "@/components/admin/ManagedSeasonDangerZone"

type ManagedSeason = { id: string; season_number: number; is_active: boolean; is_locked: boolean; start_date: string | null; end_date: string | null; division_count: number | null; status: string | null }
type SavedSeasonDetails = { season_id: string; start_date: string; end_date: string; schedule_changes_detected: boolean }
type ResizedRoster = { schedule_changes_detected: boolean }

export default function PypEditSeasonPage() {
  const router = useRouter()
  const [seasons, setSeasons] = useState<ManagedSeason[]>([])
  const [seasonId, setSeasonId] = useState("")
  const [divisionCount, setDivisionCount] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const preferredId = new URLSearchParams(window.location.search).get("seasonId") || undefined
    void loadSeasons(preferredId)
  }, [])

  async function loadSeasons(preferredId?: string) {
    setLoading(true)
    const { data: seasonData, error: seasonError } = await supabase
      .from("seasons")
      .select("id, season_number, is_active, is_locked, start_date, end_date")
      .ilike("league_type", "pyp")
      .is("division", null)
      .order("season_number", { ascending: false })

    if (seasonError) {
      setMessage(`Could not load PYP seasons: ${seasonError.message}`)
      setLoading(false)
      return
    }

    const source = seasonData || []
    if (source.length === 0) {
      setSeasons([])
      setLoading(false)
      return
    }

    const { data: rosterData, error: rosterError } = await supabase
      .from("pyp_roster_versions")
      .select("season_id, division_count, status")
      .in("season_id", source.map((season) => season.id))
      .in("status", ["draft", "approved", "locked"])
      .order("created_at", { ascending: false })

    if (rosterError) {
      setMessage(`Could not load PYP rosters: ${rosterError.message}`)
      setLoading(false)
      return
    }

    const rosterBySeason = new Map<string, { division_count: number; status: string }>()
    for (const roster of rosterData || []) {
      if (!rosterBySeason.has(roster.season_id)) rosterBySeason.set(roster.season_id, roster)
    }
    const managed = source.map((season) => {
      const roster = rosterBySeason.get(season.id)
      return { ...season, division_count: roster?.division_count ?? null, status: roster?.status ?? null }
    }) as ManagedSeason[]
    const current = managed.filter((season) => !season.is_locked && season.status !== "locked" && season.status !== null)
    const selected = preferredId
      ? managed.find((season) => season.id === preferredId)
      : current[0] || managed[0]

    if (!selected) {
      setSeasonId("")
      setDivisionCount("")
      setStartDate("")
      setEndDate("")
      setMessage("The requested managed PYP season was not found.")
      setLoading(false)
      return
    }
    setSeasons(managed)
    setSeasonId(selected?.id || "")
    setDivisionCount(selected?.division_count ? String(selected.division_count) : "")
    setStartDate(selected?.start_date || "")
    setEndDate(selected?.end_date || "")
    setLoading(false)
  }

  function selectSeason(id: string) {
    setSeasonId(id)
    const selected = seasons.find((season) => season.id === id)
    setDivisionCount(selected?.division_count ? String(selected.division_count) : "")
    setStartDate(selected?.start_date || "")
    setEndDate(selected?.end_date || "")
    setMessage("")
  }

  async function save() {
    const count = Number(divisionCount)
    if (!seasonId || !Number.isInteger(count) || count < 1) {
      setMessage("Choose a season and enter a positive division count.")
      return
    }
    if (!startDate || !endDate) {
      setMessage("Start date and end date are required.")
      return
    }
    if (endDate < startDate) {
      setMessage("End date cannot be before the start date.")
      return
    }
    setSaving(true)
    setMessage("")
    try {
      const currentSeason = seasons.find((season) => season.id === seasonId)
      let scheduleChangesDetected = false
      if (currentSeason?.division_count && count !== currentSeason.division_count) {
        const { data, error } = await supabase.rpc("resize_pyp_season_divisions", {
          p_season_id: seasonId,
          p_new_division_count: count,
        }).single()
        if (error || !data) throw new Error(error?.message || "No resized PYP roster was returned.")
        scheduleChangesDetected = Boolean((data as ResizedRoster).schedule_changes_detected)
      }

      const { data, error } = await supabase.rpc("update_pyp_season_details", {
        p_season_id: seasonId,
        p_start_date: startDate,
        p_end_date: endDate,
      }).single()
      if (error || !data) throw new Error(error?.message || "No saved PYP season details were returned.")
      const saved = data as SavedSeasonDetails
      scheduleChangesDetected = scheduleChangesDetected || saved.schedule_changes_detected
      setMessage(scheduleChangesDetected ? "PYP season changes saved. Regenerate and review the schedule." : "PYP season changes saved.")
      await loadSeasons(seasonId)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save PYP season changes.")
    } finally {
      setSaving(false)
    }
  }

  const current = seasons.find((season) => season.id === seasonId)
  const currentSeasons = seasons.filter((season) => !season.is_locked && season.status !== "locked" && season.status !== null)
  const pastSeasons = seasons.filter((season) => !currentSeasons.some((candidate) => candidate.id === season.id))
  const historical = Boolean(current && pastSeasons.some((season) => season.id === current.id))
  const locked = historical

  return (
    <main style={page}>
      <div style={container}>
        <div style={topBar}>
          <button type="button" onClick={() => router.push("/admin/pyp")} style={secondaryButton}>← PYP Hub</button>
          <button type="button" onClick={() => router.push("/admin/pyp/season")} style={secondaryButton}>PYP Season</button>
        </div>
        <h1 style={title}>{current ? `Edit PYP Season ${current.season_number}` : "Edit PYP Season"}</h1>
        <p style={subtitle}>Choose a current managed season or an authoritative historical season.</p>

        <section style={panel}>
          {loading ? <p>Loading managed PYP seasons...</p> : seasons.length === 0 ? (
            <p style={messageStyle}>No managed PYP season is available. Create one from PYP Season first.</p>
          ) : (
            <>
              <div style={formGrid}>
                <Field label="CURRENT MANAGED SEASONS">
                  <select value={currentSeasons.some((season) => season.id === seasonId) ? seasonId : ""} onChange={(event) => selectSeason(event.target.value)} style={input} disabled={saving}>
                    <option value="" disabled>Select a current season</option>
                    {currentSeasons.map((season) => <option key={season.id} value={season.id}>Season {season.season_number} — {season.status}</option>)}
                  </select>
                </Field>
                <Field label="PAST SEASONS">
                  <select value={pastSeasons.some((season) => season.id === seasonId) ? seasonId : ""} onChange={(event) => selectSeason(event.target.value)} style={input} disabled={saving}>
                    <option value="" disabled>Select a past season</option>
                    {pastSeasons.map((season) => <option key={season.id} value={season.id}>Season {season.season_number} — {season.status || "legacy UUID"}</option>)}
                  </select>
                </Field>
                <Field label="Number of Divisions">
                  <input type="number" min="1" step="1" value={divisionCount} onChange={(event) => setDivisionCount(event.target.value)} style={input} disabled={saving || locked} />
                </Field>
                <Field label="Start Date">
                  <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} style={input} disabled={saving || locked} />
                </Field>
                <Field label="End Date">
                  <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} style={input} disabled={saving || locked} />
                </Field>
              </div>
              <p style={helper}>Legacy number-only or division-row history is not selectable because it has no single authoritative season UUID.</p>
              <p style={helper}>PYP matchup courses are selected by the players and are not season-level settings.</p>
              {locked && <p style={lockedMessage}>This historical roster is locked and cannot be resized.</p>}
              <div style={actions}>
                <button type="button" onClick={save} disabled={saving || locked} style={primaryButton}>{saving ? "Saving..." : "Save Season Changes"}</button>
                <button type="button" onClick={() => router.push(`/admin/pyp/setup?seasonId=${encodeURIComponent(seasonId)}&division=1`)} disabled={!seasonId || !current?.status} style={secondaryButton}>Open Division Setup</button>
                <button type="button" onClick={() => router.push(`/admin/pyp/schedule?seasonId=${encodeURIComponent(seasonId)}`)} disabled={!seasonId || !current?.status} style={secondaryButton}>View Schedule</button>
              </div>
            </>
          )}
          {message && <p style={messageStyle}>{message}</p>}
        </section>
        {current && (
          <ManagedSeasonDangerZone
            seasonId={current.id}
            seasonNumber={current.season_number}
            leagueName="PYP"
            returnPath="/admin/pyp/season"
            historical={historical}
          />
        )}
      </div>
    </main>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label style={field}><span style={labelStyle}>{label}</span>{children}</label> }
const page: React.CSSProperties = { minHeight: "100vh", padding: 24, background: "black", color: "white" }
const container: React.CSSProperties = { maxWidth: 980, margin: "0 auto" }
const topBar: React.CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }
const title: React.CSSProperties = { fontSize: 34, marginBottom: 8 }
const subtitle: React.CSSProperties = { color: "#bbb", marginBottom: 28 }
const panel: React.CSSProperties = { padding: 24, borderRadius: 14, border: "1px solid #333", background: "#0d0d0d" }
const formGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8 }
const labelStyle: React.CSSProperties = { color: "#ddd", fontWeight: 700 }
const input: React.CSSProperties = { boxSizing: "border-box", width: "100%", padding: 12, borderRadius: 8, border: "1px solid #444", background: "#111", color: "white" }
const helper: React.CSSProperties = { color: "#aaa", marginTop: 18 }
const actions: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 10, marginTop: 22 }
const primaryButton: React.CSSProperties = { padding: "12px 18px", borderRadius: 8, border: "1px solid #167a45", background: "#126b3c", color: "white", fontWeight: 800, cursor: "pointer" }
const secondaryButton: React.CSSProperties = { padding: "10px 14px", borderRadius: 8, border: "1px solid #555", background: "#171717", color: "white", cursor: "pointer" }
const messageStyle: React.CSSProperties = { marginTop: 16, padding: 12, borderRadius: 8, border: "1px solid #444", background: "#171717" }
const lockedMessage: React.CSSProperties = { ...messageStyle, borderColor: "#7c5b17", color: "#facc15" }
