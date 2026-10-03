"use client"

import { Suspense, useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react"
import { useSearchParams } from "next/navigation"

type Member = { id: string; screen_name: string }
type Team = { id: string; team_name_snapshot: string; division: string; members: Member[] }
type Draft = { season_team_id: string; course_slot: Slot; course_name: string; player_one_id: string; player_two_id: string; player_one_holes: number[]; player_two_holes: number[]; home_holes_won: number | null; away_holes_won: number | null; status: string }
type Evidence = { course_slot: Slot; status: string; original_filename: string }
type Slot = "HOME_TEAM_COURSE" | "AWAY_TEAM_COURSE"
type Workspace = { fixture: { id: string; game_number: number; division: string; home_season_team_id: string; away_season_team_id: string; home_course: string; away_course: string; arranged_at: string | null }; callerTeamId: string; homeTeam: Team; awayTeam: Team; drafts: Draft[]; evidence: Evidence[]; state: string }

const slots: Slot[] = ["HOME_TEAM_COURSE", "AWAY_TEAM_COURSE"]

function DoublesScorecardClient() {
  const searchParams = useSearchParams()
  const fixtureId = searchParams.get("fixture_id") || ""
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [holes, setHoles] = useState<Record<string, number[]>>({})
  const [totals, setTotals] = useState<Record<string, { home: string; away: string }>>({})
  const [files, setFiles] = useState<Record<string, File | null>>({})
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  const fetchWorkspace = useCallback(async (): Promise<Workspace> => {
    const response = await fetch(`/api/doubles/workspace?fixture_id=${encodeURIComponent(fixtureId)}`, { cache: "no-store" })
    const data = await response.json() as Workspace & { error?: string }
    if (!response.ok) throw new Error(data.error || "Doubles workspace unavailable")
    return data
  }, [fixtureId])

  function prepareWorkspace(data: Workspace) {
    setWorkspace(data)
    const nextHoles: Record<string, number[]> = {}
    const nextTotals: Record<string, { home: string; away: string }> = {}
    for (const slot of slots) {
      const draft = data.drafts.find((row) => row.season_team_id === data.callerTeamId && row.course_slot === slot)
      nextHoles[`${slot}:0`] = draft?.player_one_holes || Array(18).fill(0)
      nextHoles[`${slot}:1`] = draft?.player_two_holes || Array(18).fill(0)
      nextTotals[slot] = { home: draft?.home_holes_won === null || draft?.home_holes_won === undefined ? "" : String(draft.home_holes_won), away: draft?.away_holes_won === null || draft?.away_holes_won === undefined ? "" : String(draft.away_holes_won) }
    }
    setHoles(nextHoles); setTotals(nextTotals)
  }

  async function load() { if (fixtureId) prepareWorkspace(await fetchWorkspace()) }

  useEffect(() => {
    if (!fixtureId) return
    let active = true
    void fetchWorkspace().then((data) => { if (active) prepareWorkspace(data) }).catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "Doubles workspace unavailable") })
    return () => { active = false }
  }, [fetchWorkspace, fixtureId])

  const ownTeam = useMemo(() => { if (!workspace) return undefined; return workspace.callerTeamId === workspace.fixture.home_season_team_id ? workspace.homeTeam : workspace.awayTeam }, [workspace])
  async function save(slot: Slot, submit: boolean) {
    if (!workspace || !ownTeam) return
    setBusy(true); setMessage("")
    try {
      const response = await fetch("/api/doubles/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fixture_id: fixtureId, action: submit ? "submit" : "save_draft", course_slot: slot, player_one_holes: holes[`${slot}:0`], player_two_holes: holes[`${slot}:1`], home_holes_won: totals[slot]?.home ?? "", away_holes_won: totals[slot]?.away ?? "" }) })
      const data = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(data.error || "Could not save team score")
      setMessage(data.message || "Saved"); await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save team score") } finally { setBusy(false) }
  }
  async function upload(slot: Slot) {
    const file = files[slot]
    if (!file) return setMessage("Choose a scorecard photo first.")
    setBusy(true); setMessage("")
    try {
      const form = new FormData(); form.set("fixture_id", fixtureId); form.set("course_slot", slot); form.set("file", file)
      const response = await fetch("/api/doubles/evidence", { method: "POST", body: form }); const data = await response.json() as { error?: string }
      if (!response.ok) throw new Error(data.error || "Evidence upload failed")
      setMessage(`${slot === "HOME_TEAM_COURSE" ? "Home Team's Course" : "Away Team's Course"} evidence submitted.`); await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : "Evidence upload failed") } finally { setBusy(false) }
  }
  if (!fixtureId) return <main style={shell}><h1>Doubles Team Workspace</h1><p>Open this page from a scheduled Doubles fixture.</p></main>
  if (!workspace || !ownTeam) return <main style={shell}><h1>Doubles Team Workspace</h1><p>{message || "Loading fixture…"}</p></main>
  return <main style={shell}><header style={header}><p style={eyebrow}>DOUBLES MATCH PLAY · {workspace.fixture.division}</p><h1>{ownTeam.team_name_snapshot}</h1><p>Game {workspace.fixture.game_number} · {workspace.callerTeamId === workspace.fixture.home_season_team_id ? "HOME TEAM" : "AWAY TEAM"}</p><p>Fixture status: <strong>{workspace.state.replaceAll("_", " ")}</strong></p></header><section style={opponent}><strong>HOME TEAM</strong><span>{workspace.homeTeam.team_name_snapshot}</span><strong>vs</strong><strong>AWAY TEAM</strong><span>{workspace.awayTeam.team_name_snapshot}</span></section>{slots.map((slot) => <CourseCard key={slot} slot={slot} workspace={workspace} ownTeam={ownTeam} holes={holes} setHoles={setHoles} totals={totals} setTotals={setTotals} files={files} setFiles={setFiles} upload={upload} save={save} busy={busy} />)}{message && <p role="status" style={notice}>{message}</p>}</main>
}

function CourseCard({ slot, workspace, ownTeam, holes, setHoles, totals, setTotals, files, setFiles, upload, save, busy }: { slot: Slot; workspace: Workspace; ownTeam: Team; holes: Record<string, number[]>; setHoles: Dispatch<SetStateAction<Record<string, number[]>>>; totals: Record<string, { home: string; away: string }>; setTotals: Dispatch<SetStateAction<Record<string, { home: string; away: string }>>>; files: Record<string, File | null>; setFiles: Dispatch<SetStateAction<Record<string, File | null>>>; upload: (slot: Slot) => Promise<void>; save: (slot: Slot, submit: boolean) => Promise<void>; busy: boolean }) {
  const courseName = slot === "HOME_TEAM_COURSE" ? workspace.fixture.home_course : workspace.fixture.away_course
  const draft = workspace.drafts.find((row) => row.season_team_id === workspace.callerTeamId && row.course_slot === slot)
  const evidence = workspace.evidence.find((row) => row.course_slot === slot)
  const title = slot === "HOME_TEAM_COURSE" ? "HOME TEAM'S COURSE" : "AWAY TEAM'S COURSE"
  function changeRow(row: 0 | 1, index: number, value: number) { setHoles((current) => ({ ...current, [`${slot}:${row}`]: (current[`${slot}:${row}`] || Array(18).fill(0)).map((item, itemIndex) => itemIndex === index ? value : item) })) }
  return <section style={card}><div style={cardHeading}><div><p style={eyebrow}>{title}</p><h2>{courseName}</h2><p>Your team: {ownTeam.members.map((member) => member.screen_name).join(" · ")}</p></div><strong>{draft?.status || "DRAFT"}</strong></div><div style={rows}>{ownTeam.members.slice(0, 2).map((member, row) => <div key={member.id}><h3>{member.screen_name}</h3><div style={holeGrid}>{Array.from({ length: 18 }, (_, index) => <label key={index}><span>{index + 1}</span><select aria-label={`${member.screen_name} hole ${index + 1}`} value={holes[`${slot}:${row}`]?.[index] ?? 0} onChange={(event) => changeRow(row as 0 | 1, index, Number(event.target.value))} disabled={busy || draft?.status === "SUBMITTED"}><option value={0}>0</option><option value={1}>1</option></select></label>)}</div></div>)}</div><div style={totalsGrid}><label>HOME TEAM HOLES WON<input inputMode="numeric" min="0" max="18" value={totals[slot]?.home || ""} onChange={(event) => setTotals((current) => ({ ...current, [slot]: { ...(current[slot] || { home: "", away: "" }), home: event.target.value } }))} disabled={busy || draft?.status === "SUBMITTED"} /></label><label>AWAY TEAM HOLES WON<input inputMode="numeric" min="0" max="18" value={totals[slot]?.away || ""} onChange={(event) => setTotals((current) => ({ ...current, [slot]: { ...(current[slot] || { home: "", away: "" }), away: event.target.value } }))} disabled={busy || draft?.status === "SUBMITTED"} /></label></div><div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) setFiles((current) => ({ ...current, [slot]: file })) }} style={dropzone}><strong>{title} SCORECARD</strong><span>{evidence?.status || "NOT SUBMITTED"}</span><input type="file" accept="image/*" onChange={(event) => setFiles((current) => ({ ...current, [slot]: event.target.files?.[0] || null }))} disabled={busy || evidence?.status === "VERIFIED"} /><small>Tap to choose or drag and drop. One shared photo per course.</small><button type="button" onClick={() => void upload(slot)} disabled={busy || !files[slot] || evidence?.status === "VERIFIED"}>Upload evidence</button></div><div style={actions}><button type="button" onClick={() => void save(slot, false)} disabled={busy || draft?.status === "SUBMITTED"}>Save draft</button><button type="button" onClick={() => void save(slot, true)} disabled={busy || draft?.status === "SUBMITTED"}>Submit team course</button></div></section>
}

const shell = { minHeight: "100vh", padding: 24, maxWidth: 1100, margin: "0 auto", color: "#f8fafc", background: "#020617" }
const header = { padding: 24, borderRadius: 18, background: "linear-gradient(135deg,#172554,#0f172a)", border: "1px solid #334155" }
const opponent = { display: "flex", flexWrap: "wrap" as const, gap: 12, alignItems: "center", padding: 16, margin: "18px 0", borderRadius: 14, background: "#111827" }
const card = { padding: 22, marginTop: 18, borderRadius: 18, background: "#0f172a", border: "1px solid #334155" }
const cardHeading = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start" }
const rows = { display: "grid", gap: 18, marginTop: 20 }
const holeGrid = { display: "grid", gridTemplateColumns: "repeat(9,minmax(54px,1fr))", gap: 7 }
const totalsGrid = { display: "grid", gridTemplateColumns: "repeat(2,minmax(140px,1fr))", gap: 12, marginTop: 20 }
const dropzone = { display: "grid", gap: 8, marginTop: 20, padding: 16, border: "1px dashed #64748b", borderRadius: 12 }
const actions = { display: "flex", gap: 10, flexWrap: "wrap" as const, marginTop: 18 }
const notice = { padding: 14, borderRadius: 10, background: "#422006", color: "#fde68a" }

export default function DoublesScorecardPage() {
  return <Suspense fallback={<main style={shell}><h1>Doubles Team Workspace</h1><p>Loading fixture…</p></main>}><DoublesScorecardClient /></Suspense>
}
const eyebrow = { margin: 0, color: "#93c5fd", letterSpacing: ".12em", fontSize: 12 }
