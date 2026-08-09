"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type Fixture = { id: string; division_number: number; game_number: number; pyp_home_player_screen_name: string; pyp_away_player_screen_name: string }
type ScheduleState = { change_revision: number; generated_revision: number; reviewed_revision: number }
type Season = { season_number: number; start_date: string | null; end_date: string | null; league_type: string | null }
type Roster = { status: "draft" | "approved" | "locked"; division_count: number }

const themes: Record<number, { accent: string; border: string; background: string }> = {
  1: { accent: "#fb923c", border: "#9a3412", background: "rgba(124,45,18,.18)" },
  2: { accent: "#4ade80", border: "#15803d", background: "rgba(20,83,45,.18)" },
  3: { accent: "#60a5fa", border: "#1d4ed8", background: "rgba(30,64,175,.16)" },
  4: { accent: "#facc15", border: "#a16207", background: "rgba(113,63,18,.18)" },
  5: { accent: "#c084fc", border: "#7e22ce", background: "rgba(88,28,135,.18)" },
}
const neutralTheme = { accent: "#bbb", border: "#555", background: "#10131a" }

export default function PypSchedulePage() {
  const router = useRouter()
  const [seasonId, setSeasonId] = useState("")
  const [season, setSeason] = useState<Season | null>(null)
  const [roster, setRoster] = useState<Roster | null>(null)
  const [scheduleState, setScheduleState] = useState<ScheduleState | null>(null)
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [division, setDivision] = useState(1)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [previewUrl, setPreviewUrl] = useState("")

  const load = useCallback(async (id: string) => {
    setLoading(true)
    const [{ data: seasonData, error: seasonError }, { data: rosterData, error: rosterError }, { data: stateData, error: stateError }, { data: fixtureData, error: fixtureError }] = await Promise.all([
      supabase.from("seasons").select("season_number, start_date, end_date, league_type").eq("id", id).maybeSingle(),
      supabase.from("pyp_roster_versions").select("status, division_count").eq("season_id", id).in("status", ["draft", "approved", "locked"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("pyp_schedule_state").select("change_revision, generated_revision, reviewed_revision").eq("season_id", id).maybeSingle(),
      supabase.from("schedule").select("id, division_number, game_number, pyp_home_player_screen_name, pyp_away_player_screen_name").eq("league_type", "pyp").eq("season_id", id).not("pyp_roster_version_id", "is", null).order("division_number").order("game_number"),
    ])
    const error = seasonError || rosterError || stateError || fixtureError
    if (error || !seasonData || seasonData.league_type !== "pyp" || !rosterData) {
      setMessage(error?.message || "Managed PYP season was not found.")
      setLoading(false)
      return
    }
    setSeason(seasonData as Season)
    setRoster(rosterData as Roster)
    setScheduleState(stateData as ScheduleState | null)
    setFixtures((fixtureData || []) as Fixture[])
    setLoading(false)
  }, [])

  // The URL-scoped managed schedule context is intentionally loaded once.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("seasonId") || ""
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeasonId(id)
    if (id) void load(id)
    else { setMessage("A seasonId is required to review a PYP schedule."); setLoading(false) }
  }, [load])

  async function runWorkflowRpc(name: "generate_pyp_schedule" | "review_pyp_schedule") {
    setBusy(true)
    setMessage("")
    const { error } = await supabase.rpc(name, { p_season_id: seasonId })
    setBusy(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage(name === "review_pyp_schedule" ? "PYP schedule reviewed." : "PYP schedule generated.")
    await load(seasonId)
  }

  const generated = Boolean(scheduleState && scheduleState.generated_revision > 0)
  const current = Boolean(scheduleState && scheduleState.generated_revision > 0 && scheduleState.generated_revision === scheduleState.change_revision)
  const reviewed = Boolean(current && scheduleState && scheduleState.reviewed_revision === scheduleState.generated_revision)
  const workflowLabel = !generated ? "Not Generated" : !current ? "Stale — Regeneration Required" : !reviewed ? "Current — Needs Review" : "Reviewed"
  const shown = useMemo(() => fixtures.filter((fixture) => fixture.division_number === division), [division, fixtures])
  const theme = themes[division] || neutralTheme

  function createImageUrl() {
    if (!season) return ""
    const canvas = document.createElement("canvas")
    canvas.width = 1080
    canvas.height = 1350
    const context = canvas.getContext("2d")
    if (!context) return ""
    context.fillStyle = "#080b12"
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = theme.accent
    context.fillRect(0, 0, canvas.width, 12)
    context.fillStyle = "#fff"
    context.font = "bold 46px Arial, sans-serif"
    context.fillText(`KRYS LEAGUES · PYP · SEASON ${season.season_number}`, 60, 90)
    context.fillStyle = theme.accent
    context.font = "bold 56px Arial, sans-serif"
    context.fillText(`DIVISION ${division}`, 60, 165)
    let y = 250
    for (let round = 1; round <= 3; round += 1) {
      context.fillStyle = "#fff"
      context.font = "bold 34px Arial, sans-serif"
      context.fillText(`ROUND ${round}`, 60, y)
      y += 55
      for (const fixture of shown.filter((item) => item.game_number === round)) {
        const homeText = `HOME · ${fixture.pyp_home_player_screen_name}`
        const awayText = `AWAY · ${fixture.pyp_away_player_screen_name}`
        const versusText = "vs"
        let fontSize = 31
        context.font = `bold ${fontSize}px Arial, sans-serif`
        while (
          fontSize > 21 &&
          context.measureText(homeText).width +
            context.measureText(versusText).width +
            context.measureText(awayText).width +
            48 >
            canvas.width - 160
        ) {
          fontSize -= 1
          context.font = `bold ${fontSize}px Arial, sans-serif`
        }
        let matchupX = 80
        context.fillStyle = theme.accent
        context.fillText(homeText, matchupX, y)
        matchupX += context.measureText(homeText).width + 24
        context.fillStyle = "#888"
        context.fillText(versusText, matchupX, y)
        matchupX += context.measureText(versusText).width + 24
        context.fillStyle = "#ddd"
        context.fillText(awayText, matchupX, y)
        y += 60
      }
      y += 35
    }
    context.fillStyle = "#ddd"
    context.font = "26px Arial, sans-serif"
    for (const rule of ["Home player is the person in color.", "Course 1: Home picks; Away hits first.", "Course 2: Away picks; Home hits first.", "Players may choose Easy or Hard."]) {
      context.fillText(rule, 60, y)
      y += 42
    }
    return canvas.toDataURL("image/png")
  }

  function preview() { setPreviewUrl(createImageUrl()) }
  function download() {
    if (!season) return
    const url = createImageUrl()
    if (!url) return
    const anchor = document.createElement("a")
    anchor.download = `PYP-S${season.season_number}-D${division}.png`
    anchor.href = url
    anchor.click()
  }

  return (
    <main style={page}>
      <div style={container}>
        <div style={topBar}>
          <button type="button" onClick={() => router.push(`/admin/pyp/setup?seasonId=${encodeURIComponent(seasonId)}&division=1`)} style={secondaryButton} disabled={!seasonId}>← PYP Setup</button>
          <button type="button" onClick={() => router.push("/admin/pyp")} style={secondaryButton}>← PYP Hub</button>
        </div>
        <h1 style={title}>PYP Schedule &amp; Images</h1>
        <p style={subtitle}>{season ? `Managed PYP Season ${season.season_number}` : "Review a managed PYP schedule."}</p>

        {loading ? <p>Loading managed PYP schedule...</p> : roster && (
          <>
            <section style={workflowPanel}>
              <div><h2 style={sectionTitle}>Season Workflow</h2><p style={helper}>Roster: <strong style={{ textTransform: "capitalize" }}>{roster.status}</strong> · Schedule: <strong>{workflowLabel}</strong></p></div>
              <div style={actions}>
                <button type="button" disabled={busy || roster.status !== "approved"} onClick={() => runWorkflowRpc("generate_pyp_schedule")} style={primaryButton}>{busy ? "Working..." : generated ? "Regenerate Schedule" : "Generate Schedule"}</button>
                <button type="button" disabled={busy || !current} onClick={() => runWorkflowRpc("review_pyp_schedule")} style={secondaryButton}>Review Schedule</button>
              </div>
            </section>

            <div style={divisionTabs}>{Array.from({ length: roster.division_count }, (_, index) => index + 1).map((number) => <button type="button" key={number} onClick={() => { setDivision(number); setPreviewUrl("") }} style={number === division ? { ...divisionButton, borderColor: theme.accent, color: theme.accent } : divisionButton}>D{number}</button>)}</div>

            <section style={{ ...divisionCard, borderColor: theme.border, background: theme.background }}>
              <div style={divisionHeader}><h2 style={{ margin: 0, color: theme.accent }}>PYP D{division}</h2><span style={statusPill}>{shown.length} fixtures</span></div>
              {[1, 2, 3].map((round) => <div key={round} style={roundCard}><h3>Round {round}</h3>{shown.filter((fixture) => fixture.game_number === round).length === 0 ? <p style={helper}>No real-player fixture.</p> : shown.filter((fixture) => fixture.game_number === round).map((fixture) => <div key={fixture.id} style={fixtureRow}><strong style={{ color: theme.accent }}>HOME · {fixture.pyp_home_player_screen_name}</strong><span style={versus}>vs</span><span>AWAY · {fixture.pyp_away_player_screen_name}</span></div>)}</div>)}
              <div style={rules}><strong>PYP course rules</strong><span>Home player is the person in color.</span><span>Course 1: Home chooses; Away hits first.</span><span>Course 2: Away chooses; Home hits first.</span><span>Players may choose Easy or Hard.</span></div>
            </section>

            <section style={imagePanel}>
              <h2 style={sectionTitle}>Schedule Images</h2>
              <p style={helper}>Preview or download the current division schedule image.</p>
              {/* Canvas data URLs are generated locally for the exact downloadable preview. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {previewUrl && <img src={previewUrl} alt={`PYP Season ${season?.season_number} Division ${division} schedule preview`} style={previewImage} />}
              <div style={imageActions}><button type="button" onClick={download} style={secondaryButton}>Download PYP D{division} Image</button><button type="button" onClick={preview} style={secondaryButton}>Preview</button>{division < roster.division_count && <button type="button" onClick={() => { setDivision(division + 1); setPreviewUrl("") }} style={secondaryButton}>Next Division →</button>}</div>
            </section>
          </>
        )}
        {message && <p style={messageStyle}>{message}</p>}
      </div>
    </main>
  )
}

const page: React.CSSProperties = { minHeight: "100vh", padding: 24, background: "black", color: "white" }
const container: React.CSSProperties = { maxWidth: 1100, margin: "0 auto" }
const topBar: React.CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }
const title: React.CSSProperties = { fontSize: 34, marginBottom: 8 }
const subtitle: React.CSSProperties = { color: "#bbb", marginBottom: 24 }
const workflowPanel: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 18, padding: 22, border: "1px solid #333", borderRadius: 14, background: "#0d0d0d" }
const sectionTitle: React.CSSProperties = { margin: 0 }
const helper: React.CSSProperties = { color: "#aaa" }
const actions: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 10 }
const divisionTabs: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, margin: "22px 0" }
const divisionButton: React.CSSProperties = { minWidth: 44, padding: "8px 10px", borderRadius: 8, border: "1px solid #444", background: "#111", color: "white", cursor: "pointer" }
const divisionCard: React.CSSProperties = { border: "2px solid", borderRadius: 16, padding: 22 }
const divisionHeader: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }
const statusPill: React.CSSProperties = { padding: "6px 10px", borderRadius: 999, border: "1px solid #555", background: "rgba(0,0,0,.35)", color: "#ddd" }
const roundCard: React.CSSProperties = { marginTop: 18, padding: 16, borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "rgba(0,0,0,.28)" }
const fixtureRow: React.CSSProperties = { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px 12px", width: "fit-content", maxWidth: "100%", padding: "10px 0", borderTop: "1px solid rgba(255,255,255,.08)" }
const versus: React.CSSProperties = { color: "#888", fontWeight: 800 }
const rules: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 7, marginTop: 22, color: "#ddd" }
const imagePanel: React.CSSProperties = { marginTop: 22, padding: 22, borderRadius: 14, border: "1px solid #333", background: "#0d0d0d" }
const previewImage: React.CSSProperties = { display: "block", width: "100%", maxWidth: 540, height: "auto", margin: "18px auto", borderRadius: 10, border: "1px solid #444" }
const imageActions: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 10, marginTop: 18 }
const primaryButton: React.CSSProperties = { padding: "12px 18px", borderRadius: 8, border: "1px solid #167a45", background: "#126b3c", color: "white", fontWeight: 800, cursor: "pointer" }
const secondaryButton: React.CSSProperties = { padding: "10px 14px", borderRadius: 8, border: "1px solid #555", background: "#171717", color: "white", cursor: "pointer" }
const messageStyle: React.CSSProperties = { marginTop: 16, padding: 12, borderRadius: 8, border: "1px solid #444", background: "#171717" }
