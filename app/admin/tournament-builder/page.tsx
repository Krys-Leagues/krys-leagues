"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { localDateTimeToUtc } from "@/lib/tournaments/schedule"

type Template = { id: string; name: string; description: string; bracket_size: number; rules: Record<string, unknown> }
type Tournament = { id: string; name: string; status: string; bracket_size: number; registration_capacity: number; slug: string; schedule_preset?: string; schedule_timezone?: string; start_at?: string | null; overall_deadline_at?: string | null }
type RoundDraft = { name: string; courseConfig: string; scoringRules: string; tiebreakerRules: string }

const fiveFourThreeTwoOne = { name: "5, 4, 3, 2, 1", description: "Hole-in-one 5 · Condor 4 · Albatross 3 · Eagle 2 · Birdie 1 · Most points wins", bracketSize: 32 }
const fiveFourThreeTwoOneScoring = JSON.stringify({ hole_in_one: 5, condor: 4, albatross: 3, eagle: 2, birdie: 1, par_or_worse: 0, winner: "most_points", handicap: "none" })

function makeFiveFourThreeTwoOneRounds(): RoundDraft[] {
  return [
    { name: "Round 1", courseConfig: '{"course":"Gothic Easy"}', scoringRules: fiveFourThreeTwoOneScoring, tiebreakerRules: "{}" },
    { name: "Round 2", courseConfig: '{"course":"Gothic Easy"}', scoringRules: fiveFourThreeTwoOneScoring, tiebreakerRules: "{}" },
    { name: "Round 3", courseConfig: '{"course":"Gothic Hard"}', scoringRules: fiveFourThreeTwoOneScoring, tiebreakerRules: "{}" },
    { name: "Round 4", courseConfig: '{"course":"Gothic Hard"}', scoringRules: fiveFourThreeTwoOneScoring, tiebreakerRules: "{}" },
    { name: "Final", courseConfig: '{"easy":"Gothic Easy","hard":"Gothic Hard"}', scoringRules: fiveFourThreeTwoOneScoring, tiebreakerRules: '{"course":"Forgotten Fairyland","policy":"back_nine_then_front_nine_sudden_death"}' },
  ]
}

function makeRoundDraft(size: 32 | 64): RoundDraft[] {
  const roundCount = Math.log2(size)
  return Array.from({ length: roundCount }, (_, index) => ({ name: index === roundCount - 1 ? "Final" : `Round ${index + 1}`, courseConfig: "{}", scoringRules: "{}", tiebreakerRules: index === roundCount - 1 ? '{"policy":"admin_verified_event_rule"}' : "{}" }))
}

function parseRoundJson(value: string, label: string) {
  const parsed = JSON.parse(value) as unknown
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error(`${label} must be a JSON object`)
  return parsed
}

export default function TournamentBuilderPage() {
  const [size, setSize] = useState<32 | 64>(32)
  const [rounds, setRounds] = useState<RoundDraft[]>(() => makeRoundDraft(32))
  const [templates, setTemplates] = useState<Template[]>([])
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [name, setName] = useState("5, 4, 3, 2, 1")
  const [status, setStatus] = useState("draft")
  const [message, setMessage] = useState("Loading protected tournament data…")
  const [schemaReady, setSchemaReady] = useState(true)
  const [busy, setBusy] = useState(false)
  const [schedulePreset, setSchedulePreset] = useState<"NORMAL" | "ONE_DAY" | "CUSTOM">("NORMAL")
  const [scheduleTimezone, setScheduleTimezone] = useState("America/New_York")
  const [startLocal, setStartLocal] = useState("")
  const [overallDeadlineLocal, setOverallDeadlineLocal] = useState("")
  const [controlStatus, setControlStatus] = useState<Record<string, string>>({})
  const [controlReason, setControlReason] = useState<Record<string, string>>({})

  async function load() {
    const response = await fetch("/api/admin/tournaments", { cache: "no-store" })
    const builder = await response.json().catch(() => ({})) as { templates?: Template[]; tournaments?: Tournament[]; error?: string }
    setTemplates(builder.templates ?? [])
    setTournaments(builder.tournaments ?? [])
    setSchemaReady(response.ok)
    setMessage(builder.error || (response.ok ? "Create the event, then let players register themselves on its public signup page." : "Tournament Builder schema is not installed in the current environment."))
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [])

  const ready = schemaReady && name.trim().length > 0 && Boolean(startLocal) && Boolean(overallDeadlineLocal)

  async function createTournament() {
    if (!ready) return
    let configuredRounds: Array<{ name: string; course_config: unknown; scoring_rules: unknown; tiebreaker_rules: unknown }>
    try {
      configuredRounds = rounds.map((round) => ({ name: round.name.trim(), course_config: parseRoundJson(round.courseConfig, `${round.name} course assignment`), scoring_rules: parseRoundJson(round.scoringRules, `${round.name} scoring rules`), tiebreaker_rules: parseRoundJson(round.tiebreakerRules, `${round.name} tiebreaker rules`) }))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Each round must contain valid JSON objects.")
      return
    }
    let startAt: string
    let overallDeadlineAt: string
    try {
      startAt = localDateTimeToUtc(startLocal, scheduleTimezone)
      overallDeadlineAt = localDateTimeToUtc(overallDeadlineLocal, scheduleTimezone)
      if (new Date(overallDeadlineAt) <= new Date(startAt)) throw new Error("The overall deadline must be later than the scheduled start")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The schedule could not be validated.")
      return
    }
    setBusy(true)
    const response = await fetch("/api/admin/tournaments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      action: "create_tournament", name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), bracketSize: size, status, schedulePreset, scheduleTimezone, startAt, overallDeadlineAt,
      templateId: templates.find((template) => template.name === name)?.id || null,
      rules: size === 32 ? { scoring: { hole_in_one: 5, condor: 4, albatross: 3, eagle: 2, birdie: 1, winner: "most_points" }, tiebreaker: { course: "Forgotten Fairyland", policy: "approved_event_rules" } } : {}, rounds: configuredRounds, entrants: [],
    }) })
    const body = await response.json().catch(() => ({})) as { tournamentId?: string; error?: string }
    setMessage(body.error || (body.tournamentId ? `Created ${body.tournamentId}. Public self-registration is now ${status === "registration_open" ? "open" : "ready to open"}.` : "Tournament creation did not complete."))
    setBusy(false)
    if (response.ok) await load()
  }

  async function saveFiveTemplate() {
    setBusy(true)
    const response = await fetch("/api/admin/tournaments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_template", name: fiveFourThreeTwoOne.name, description: fiveFourThreeTwoOne.description, bracketSize: 32, rules: { scoring: { hole_in_one: 5, condor: 4, albatross: 3, eagle: 2, birdie: 1, winner: "most_points" }, tiebreaker: { course: "Forgotten Fairyland", policy: "approved_event_rules" } } }) })
    const body = await response.json().catch(() => ({})) as { error?: string }
    setMessage(body.error || "5, 4, 3, 2, 1 template saved without changing existing tournaments.")
    setBusy(false)
    if (response.ok) await load()
  }

  function useFiveTemplate() {
    setName(fiveFourThreeTwoOne.name)
    setSize(32)
    setRounds(makeFiveFourThreeTwoOneRounds())
    setStatus("draft")
    setSchedulePreset("NORMAL")
    setScheduleTimezone("America/New_York")
    setStartLocal("")
    setOverallDeadlineLocal("")
    setMessage("5, 4, 3, 2, 1 template loaded. Review the rules and schedule, then save the tournament as Draft.")
  }

  async function uploadArtwork(file: File | undefined) {
    if (!file) return
    const form = new FormData()
    form.set("artwork", file)
    const response = await fetch("/api/admin/tournaments/artwork", { method: "POST", body: form })
    const body = await response.json().catch(() => ({})) as { path?: string; error?: string }
    setMessage(body.error || `Artwork uploaded to protected path ${body.path}. Attach it to a tournament during setup.`)
  }

  async function templateAction(action: "archive_template" | "duplicate_template", templateId: string) {
    const response = await fetch("/api/admin/tournaments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, templateId }) })
    const body = await response.json().catch(() => ({})) as { error?: string }
    setMessage(body.error || (action === "archive_template" ? "Template archived. Existing tournaments remain unchanged." : "Template duplicated. Existing tournaments remain unchanged."))
    if (response.ok) await load()
  }

  async function setTournamentStatus(tournamentId: string) {
    const response = await fetch("/api/admin/tournaments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "set_status", tournamentId, status: controlStatus[tournamentId] || "draft", reason: controlReason[tournamentId] || "" }) })
    const body = await response.json().catch(() => ({})) as { error?: string }
    setMessage(body.error || "Tournament lifecycle updated with an audit entry.")
    if (response.ok) await load()
  }

  return <main style={page}><div style={shell}>
    <Link href="/admin/krys-tourney" style={back}>← Tournament Admin</Link>
    <p style={eyebrow}>Protected tournament operations</p>
    <h1 style={title}>Lynne&apos;s Tournament Builder</h1>
    <p style={subtitle}>Create the event setup first, then open public registration when the schedule is ready. Players sign themselves up with their existing Krys Leagues account; the bracket is seeded only from confirmed registrations.</p>
    <div style={notice}>{message}</div>

    <section style={panel}><h2 style={sectionTitle}>Bracket and registration setup</h2><div style={grid}>
      <label>Name<input value={name} onChange={(event) => setName(event.target.value)} style={input} /></label>
      <label>Bracket size<select value={size} onChange={(event) => { const next = Number(event.target.value) as 32 | 64; setSize(next); setRounds(makeRoundDraft(next)) }} style={input}><option value={32}>32 players · 5 rounds · 31 matches</option><option value={64}>64 players · 6 rounds · 63 matches</option></select></label>
      <label>Initial state<select value={status} onChange={(event) => setStatus(event.target.value)} style={input}><option value="draft">Draft</option><option value="registration_open">Registration open</option><option value="registration_closed">Registration closed</option></select></label>
    </div><div style={scheduleGrid}><label>Schedule preset<select value={schedulePreset} onChange={(event) => setSchedulePreset(event.target.value as "NORMAL" | "ONE_DAY" | "CUSTOM")} style={input}><option value="NORMAL">Normal · 7 days per round</option><option value="ONE_DAY">One day · 60 minutes per round</option><option value="CUSTOM">Custom</option></select></label><label>Schedule IANA time zone<input value={scheduleTimezone} onChange={(event) => setScheduleTimezone(event.target.value)} style={input} placeholder="America/New_York" /></label><label>Start in that time zone<input type="datetime-local" value={startLocal} onChange={(event) => setStartLocal(event.target.value)} style={input} /></label><label>Overall deadline in that time zone<input type="datetime-local" value={overallDeadlineLocal} onChange={(event) => setOverallDeadlineLocal(event.target.value)} style={input} /></label></div><div style={capacity}><strong>0</strong> confirmed players · <strong>{size}</strong> registration places available · {ready ? "ready to create the public signup event" : "requires a name and valid schedule"}</div><div style={actions}><button type="button" onClick={() => void createTournament()} disabled={!ready || busy} style={primary}>{status === "registration_open" ? "Create and open public registration" : "Create tournament setup"}</button></div><p style={muted}>The public signup page resolves each authenticated player to one canonical Global Player, requires confirmation of an IANA time zone, and enforces capacity and duplicate protection in the database. Existing Global Players are never treated as registered.</p></section>

    <section style={panel}><h2 style={sectionTitle}>Round courses and rules</h2><p style={muted}>Each round is saved as an immutable tournament snapshot. Enter JSON objects for the course assignment, scoring rules, and any round-specific tiebreaker. The final round is explicitly marked for final rules.</p><div style={roundGrid}>{rounds.map((round, index) => <article key={`${size}-${index}`} style={card}><strong>{round.name}</strong><label>Round name<input value={round.name} onChange={(event) => setRounds((current) => current.map((item, position) => position === index ? { ...item, name: event.target.value } : item))} style={input} /></label><label>Course assignment<textarea value={round.courseConfig} onChange={(event) => setRounds((current) => current.map((item, position) => position === index ? { ...item, courseConfig: event.target.value } : item))} style={textarea} spellCheck={false} /></label><label>Scoring rules<textarea value={round.scoringRules} onChange={(event) => setRounds((current) => current.map((item, position) => position === index ? { ...item, scoringRules: event.target.value } : item))} style={textarea} spellCheck={false} /></label><label>Tiebreaker rules<textarea value={round.tiebreakerRules} onChange={(event) => setRounds((current) => current.map((item, position) => position === index ? { ...item, tiebreakerRules: event.target.value } : item))} style={textarea} spellCheck={false} /></label></article>)}</div></section>

    <section style={panel}><h2 style={sectionTitle}>Registration management</h2><p style={muted}>The default roster is the confirmed self-registration list for each tournament. Open a tournament&apos;s protected roster to review canonical names, confirmed time zones, remaining places, seed order, and bracket readiness. Manual additions are a separate audited exception action there; they never browse or preselect the full Global Players directory.</p><div style={rosterLinks}>{tournaments.length === 0 ? <p style={muted}>Create a tournament above to manage its confirmed registration roster.</p> : tournaments.map((tournament) => <article key={tournament.id} style={card}><strong>{tournament.name}</strong><span>{tournament.status} · {tournament.bracket_size} places · self-registration roster</span><Link href={`/admin/tournament-builder/${tournament.id}`} style={link}>Open confirmed registration roster and seeding →</Link></article>)}</div></section>

    <section style={panel}><h2 style={sectionTitle}>Reusable templates</h2><div style={templateRow}><article style={card}><strong>5, 4, 3, 2, 1</strong><span>32 players · 5 rounds · 31 matches</span><span>Hole-in-one 5 · Condor 4 · Albatross 3 · Eagle 2 · Birdie 1</span><div style={smallActions}><button type="button" onClick={useFiveTemplate} disabled={busy} style={secondary}>Use template</button><button type="button" onClick={() => void saveFiveTemplate()} disabled={busy} style={secondary}>Save template</button></div></article>{templates.filter((template) => template.name !== fiveFourThreeTwoOne.name).map((template) => <article style={card} key={template.id}><strong>{template.name}</strong><span>{template.bracket_size} players · immutable snapshot per tournament</span><div style={smallActions}><button type="button" onClick={() => void templateAction("duplicate_template", template.id)} style={tiny}>Duplicate</button><button type="button" onClick={() => void templateAction("archive_template", template.id)} style={tiny}>Archive</button></div></article>)}</div><label style={upload}><span>Protected artwork upload · JPG, PNG, or WebP · 8 MB maximum</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void uploadArtwork(event.target.files?.[0])} /></label></section>

    <section style={panel}><h2 style={sectionTitle}>Tournament history and lifecycle</h2>{tournaments.length === 0 ? <p style={muted}>No reusable tournaments are configured in this environment.</p> : <div style={history}>{tournaments.map((tournament) => <article key={tournament.id} style={card}><strong>{tournament.name}</strong><span>{tournament.bracket_size} players · {tournament.status}</span><span>{tournament.registration_capacity} maximum confirmed places · {tournament.schedule_preset || "NORMAL"} · {tournament.schedule_timezone || "America/New_York"}</span>{tournament.start_at && <span>Starts {new Date(tournament.start_at).toLocaleString()}</span>}{tournament.overall_deadline_at && <span>Deadline {new Date(tournament.overall_deadline_at).toLocaleString()}</span>}<label>Lifecycle state<select value={controlStatus[tournament.id] || tournament.status} onChange={(event) => setControlStatus((current) => ({ ...current, [tournament.id]: event.target.value }))} style={input}><option value="draft">Draft</option><option value="registration_open">Registration open</option><option value="registration_closed">Registration closed</option><option value="live">Live</option><option value="completed">Completed</option><option value="archived">Archived</option><option value="cancelled">Cancelled</option></select></label><label>Reason for lifecycle action<input value={controlReason[tournament.id] || ""} onChange={(event) => setControlReason((current) => ({ ...current, [tournament.id]: event.target.value }))} placeholder="Required for audited live changes" style={input} /></label><button type="button" onClick={() => void setTournamentStatus(tournament.id)} style={secondary}>Save lifecycle change</button><Link href={`/admin/tournament-builder/${tournament.id}`} style={link}>Open registration roster →</Link><Link href={`/tournaments/${tournament.slug}`} style={link}>Open public bracket →</Link></article>)}</div>}</section>
  </div></main>
}

const page: React.CSSProperties = { minHeight: "100vh", background: "#05070b", color: "#f8fafc", padding: "30px 16px 80px" }
const shell: React.CSSProperties = { maxWidth: 1180, margin: "0 auto" }
const back: React.CSSProperties = { color: "#f0abfc", textDecoration: "none" }
const eyebrow: React.CSSProperties = { marginTop: 30, color: "#f0abfc", fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", fontSize: 12 }
const title: React.CSSProperties = { fontSize: "clamp(32px, 5vw, 56px)", margin: "8px 0" }
const subtitle: React.CSSProperties = { maxWidth: 800, color: "#cbd5e1", lineHeight: 1.7 }
const panel: React.CSSProperties = { marginTop: 18, padding: 20, border: "1px solid #293244", borderRadius: 18, background: "#101722" }
const sectionTitle: React.CSSProperties = { margin: "0 0 14px", fontSize: 20 }
const notice: React.CSSProperties = { marginTop: 18, padding: 14, borderRadius: 12, background: "#3b2f12", color: "#fde68a", lineHeight: 1.5 }
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }
const scheduleGrid: React.CSSProperties = { ...grid, marginTop: 16 }
const input: React.CSSProperties = { display: "block", width: "100%", marginTop: 6, padding: 11, border: "1px solid #475569", borderRadius: 9, background: "#070b12", color: "white" }
const capacity: React.CSSProperties = { marginTop: 16, color: "#cbd5e1" }
const actions: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }
const primary: React.CSSProperties = { border: 0, borderRadius: 999, padding: "11px 17px", background: "#f0abfc", color: "#24102c", fontWeight: 900, cursor: "pointer" }
const secondary: React.CSSProperties = { border: "1px solid #64748b", borderRadius: 999, padding: "10px 15px", background: "#1e293b", color: "white", fontWeight: 800, cursor: "pointer" }
const muted: React.CSSProperties = { color: "#94a3b8", lineHeight: 1.6 }
const templateRow: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }
const rosterLinks: React.CSSProperties = { display: "grid", gap: 12 }
const card: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 7, padding: 15, border: "1px solid #334155", borderRadius: 13, background: "#0b111c", color: "#dbeafe" }
const roundGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 }
const textarea: React.CSSProperties = { ...input, minHeight: 74, resize: "vertical", fontFamily: "monospace", fontSize: 12 }
const upload: React.CSSProperties = { display: "grid", gap: 8, marginTop: 18, padding: 14, border: "1px dashed #64748b", borderRadius: 12, color: "#cbd5e1" }
const history: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }
const link: React.CSSProperties = { color: "#f0abfc", textDecoration: "none", fontWeight: 800 }
const smallActions: React.CSSProperties = { display: "flex", gap: 6 }
const tiny: React.CSSProperties = { border: "1px solid #64748b", borderRadius: 7, padding: "4px 8px", background: "#1e293b", color: "white", cursor: "pointer" }
