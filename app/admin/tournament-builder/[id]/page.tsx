"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

type Match = { id: string; round_number: number; match_number: number; player_a_id: string | null; player_b_id: string | null; status: string; winner_player_id: string | null }
type Forfeit = { id: string; match_id: string; explanation: string; status: string }
type Registration = { id: string; player_id: string; screen_name?: string | null; status: string; seed?: number | null; player_timezone?: string | null }
type Data = { tournament?: { name: string; status: string; bracket_size?: number; registration_capacity?: number; overall_deadline_at?: string | null }; registrations?: Registration[]; matches?: Match[]; forfeits?: Forfeit[]; scorecards?: Array<{ id: string; match_id: string; status: string; score_payload: Record<string, unknown> }>; error?: string }

export default function TournamentOperationsPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("")
  const [data, setData] = useState<Data>({})
  const [message, setMessage] = useState("Loading confirmed registrations…")
  const [reason, setReason] = useState<Record<string, string>>({})
  const [winner, setWinner] = useState<Record<string, string>>({})
  const [scoreLabel, setScoreLabel] = useState<Record<string, string>>({})
  const [evidenceReference, setEvidenceReference] = useState<Record<string, string>>({})
  const [trophyFile, setTrophyFile] = useState<File | null>(null)
  const [trophyPlacement, setTrophyPlacement] = useState({ x: "50", y: "80", fontSize: "32", color: "#ffffff", align: "center" })
  const [trophyPreview, setTrophyPreview] = useState<string | null>(null)
  const [trophyAwardId, setTrophyAwardId] = useState<string | null>(null)
  const [trophyDownloadUrl, setTrophyDownloadUrl] = useState<string | null>(null)
  const [seedOrder, setSeedOrder] = useState<string[]>([])
  const [manualPlayerId, setManualPlayerId] = useState("")
  const [manualTimezone, setManualTimezone] = useState("")
  const [manualReason, setManualReason] = useState("")

  // The params promise is stable for this route; loading is intentionally triggered once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void params.then(({ id: value }) => { setId(value); void load(value) }) }, [params])

  async function load(value = id) {
    const response = await fetch(`/api/admin/tournaments/${value}`, { cache: "no-store" })
    const body = await response.json().catch(() => ({})) as Data
    const registrations = (body.registrations ?? []).filter((registration) => registration.status === "confirmed")
    setData(body)
    setSeedOrder(registrations.sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999)).map((registration) => registration.player_id))
    setMessage(body.error || "Review confirmed registrations before seeding or applying an override.")
  }

  async function control(body: Record<string, unknown>) {
    const response = await fetch(`/api/admin/tournaments/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const result = await response.json().catch(() => ({})) as { error?: string }
    setMessage(result.error || "Recorded in the audit trail.")
    if (response.ok) await load()
  }

  async function personalizeTrophy(mode: "preview" | "save") {
    if (!trophyFile || !id) {
      setMessage("Select the original trophy artwork first.")
      return
    }
    const form = new FormData()
    form.set("tournamentId", id)
    form.set("mode", mode)
    form.set("trophy", trophyFile)
    form.set("x", trophyPlacement.x)
    form.set("y", trophyPlacement.y)
    form.set("fontSize", trophyPlacement.fontSize)
    form.set("color", trophyPlacement.color)
    form.set("align", trophyPlacement.align)
    const response = await fetch("/api/admin/tournaments/trophy", { method: "POST", body: form })
    const result = await response.json().catch(() => ({})) as { error?: string; preview?: string; award?: { id: string }; downloadUrl?: string; winnerName?: string }
    if (!response.ok) {
      setMessage(result.error || "Trophy personalization failed.")
      return
    }
    setMessage(mode === "preview" ? `Preview rendered for verified winner ${result.winnerName}.` : `Personalized trophy saved for verified winner ${result.winnerName}; it remains pending admin approval.`)
    if (result.preview) setTrophyPreview(result.preview)
    if (result.award?.id) setTrophyAwardId(result.award.id)
    if (result.downloadUrl) setTrophyDownloadUrl(result.downloadUrl)
  }

  async function approveTrophy() {
    if (!trophyAwardId) return
    const response = await fetch("/api/admin/tournaments/trophy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve", awardId: trophyAwardId }) })
    const result = await response.json().catch(() => ({})) as { error?: string }
    setMessage(result.error || "Trophy award approved and available on the winner profile.")
  }

  const registrations = (data.registrations ?? []).filter((registration) => registration.status === "confirmed")
  const capacity = data.tournament?.registration_capacity ?? data.tournament?.bracket_size ?? 0

  return <main style={page}><div style={shell}>
    <Link href="/admin/tournament-builder" style={link}>← Tournament Builder</Link>
    <p style={eyebrow}>Protected registration and match operations</p>
    <h1>{data.tournament?.name || "Tournament"}</h1>
    <p style={muted}>{data.tournament?.status || ""} · all overrides require a written reason and remain auditable</p>
    <div style={notice}>{message}</div>

    <section style={panel}>
      <h2>Confirmed registration roster</h2>
      <p style={muted}>{registrations.length} confirmed of {capacity} places. This is the only source for bracket seeding; the Global Players directory is not pre-registered.</p>
      {registrations.length === 0 ? <p style={muted}>No players have self-registered yet.</p> : <div style={roster}>{seedOrder.map((playerId, index) => {
        const registration = registrations.find((item) => item.player_id === playerId)
        return <div key={playerId} style={rosterRow}>
          <span><strong>{index + 1}.</strong> {registration?.screen_name || playerId}<small>{registration?.player_timezone ? ` · ${registration.player_timezone}` : " · time zone missing"}</small></span>
          <span style={row}><button type="button" disabled={index === 0} onClick={() => setSeedOrder((current) => current.map((value, position) => position === index - 1 ? current[index] : position === index ? current[index - 1] : value))} style={tiny}>↑</button><button type="button" disabled={index === seedOrder.length - 1} onClick={() => setSeedOrder((current) => current.map((value, position) => position === index ? current[index + 1] : position === index + 1 ? current[index] : value))} style={tiny}>↓</button></span>
        </div>
      })}</div>}
      <div style={row}><button type="button" disabled={data.tournament?.status !== "registration_closed" || registrations.length !== capacity || seedOrder.length === 0} onClick={() => void control({ action: "seed_bracket", playerOrder: seedOrder })} style={button}>SEED CONFIRMED REGISTRATIONS</button></div>
      <details style={manual}><summary>Manual player addition — protected exception</summary><p style={muted}>Use only for an exception. This action resolves one existing canonical player, enforces duplicate/capacity checks, and records the written reason; it never imports the Global Players directory.</p><input aria-label="Canonical player UUID" placeholder="Canonical player UUID" value={manualPlayerId} onChange={(event) => setManualPlayerId(event.target.value)} style={input} /><input aria-label="Player IANA time zone" placeholder="America/New_York" value={manualTimezone} onChange={(event) => setManualTimezone(event.target.value)} style={input} /><textarea aria-label="Manual registration reason" placeholder="Written reason" value={manualReason} onChange={(event) => setManualReason(event.target.value)} style={input} /><button type="button" disabled={!manualPlayerId || !manualTimezone || !manualReason} onClick={() => void control({ action: "manual_add_registration", playerId: manualPlayerId, playerTimezone: manualTimezone, reason: manualReason })} style={secondary}>ADD AUDITED EXCEPTION</button></details>
    </section>

    <section style={panel}><h2>Matches</h2>{(data.matches ?? []).length === 0 ? <p style={muted}>No bracket matches exist yet. Seed the full confirmed roster after registration closes.</p> : (data.matches ?? []).map((match) => <article key={match.id} style={card}><strong>Round {match.round_number} · Match {match.match_number}</strong><span>{match.player_a_id || "Waiting"} vs {match.player_b_id || "Waiting"} · {match.status}</span>{match.player_a_id && match.player_b_id && match.status !== "completed" && <div style={row}><select aria-label="Verified winner" value={winner[match.id] || ""} onChange={(event) => setWinner((current) => ({ ...current, [match.id]: event.target.value }))} style={input}><option value="">Choose verified winner</option><option value={match.player_a_id}>{match.player_a_id}</option><option value={match.player_b_id}>{match.player_b_id}</option></select><input aria-label="Verified score" placeholder="Score/result label" value={scoreLabel[match.id] || ""} onChange={(event) => setScoreLabel((current) => ({ ...current, [match.id]: event.target.value }))} style={input} /><input aria-label="Evidence reference" placeholder="Evidence reference" value={evidenceReference[match.id] || ""} onChange={(event) => setEvidenceReference((current) => ({ ...current, [match.id]: event.target.value }))} style={input} /><button type="button" disabled={!winner[match.id] || !scoreLabel[match.id] || !evidenceReference[match.id]} onClick={() => void control({ action: "record_result", matchId: match.id, winnerPlayerId: winner[match.id], scoreLabel: scoreLabel[match.id], evidenceReference: evidenceReference[match.id], idempotencyKey: crypto.randomUUID() })} style={button}>RECORD VERIFIED RESULT</button></div>}<textarea value={reason[match.id] || ""} onChange={(event) => setReason((current) => ({ ...current, [match.id]: event.target.value }))} placeholder="Written reason for overrides" style={input} /><div style={row}><button type="button" disabled={!match.player_a_id || !reason[match.id]} onClick={() => void control({ action: "force_advance", matchId: match.id, advancingPlayerId: match.player_a_id, reason: reason[match.id] || "" })} style={button}>REQUEST FORCE ADVANCE A</button><button type="button" disabled={!match.player_b_id || !reason[match.id]} onClick={() => void control({ action: "force_advance", matchId: match.id, advancingPlayerId: match.player_b_id, reason: reason[match.id] || "" })} style={button}>REQUEST FORCE ADVANCE B</button><button type="button" disabled={!reason[match.id]} onClick={() => void control({ action: "rewind", matchId: match.id, affectedMatchIds: [], reason: reason[match.id] || "" })} style={secondary}>RECORD REWIND REVIEW</button></div></article>)}</section>
    <section style={panel}><h2>Forfeit requests</h2>{(data.forfeits ?? []).length === 0 ? <p style={muted}>No pending requests.</p> : (data.forfeits ?? []).map((request) => <article key={request.id} style={card}><strong>{request.status}</strong><span>{request.explanation}</span><div style={row}><button type="button" disabled={!reason[request.id]} onClick={() => void control({ action: "decide_forfeit", forfeitRequestId: request.id, decision: "approved", reason: reason[request.id] || "" })} style={button}>APPROVE</button><button type="button" disabled={!reason[request.id]} onClick={() => void control({ action: "decide_forfeit", forfeitRequestId: request.id, decision: "denied", reason: reason[request.id] || "" })} style={secondary}>DENY</button></div></article>)}</section>
    <section style={panel}><h2>Scorecard review queue</h2>{(data.scorecards ?? []).map((scorecard) => <article key={scorecard.id} style={card}><strong>{scorecard.status}</strong><span>Match {scorecard.match_id} · {JSON.stringify(scorecard.score_payload)}</span></article>)}</section>
    <section style={panel}><h2>Verified winner trophy</h2><p style={muted}>Upload the original artwork unchanged, position the verified final winner&apos;s canonical screen name, preview the rendered PNG, then save and approve it. Disputed or incomplete finals are rejected server-side.</p><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setTrophyFile(event.target.files?.[0] || null); setTrophyPreview(null) }} /><div style={trophyControls}><label>Nameplate X %<input value={trophyPlacement.x} onChange={(event) => setTrophyPlacement((current) => ({ ...current, x: event.target.value }))} style={input} /></label><label>Nameplate Y %<input value={trophyPlacement.y} onChange={(event) => setTrophyPlacement((current) => ({ ...current, y: event.target.value }))} style={input} /></label><label>Font size<input value={trophyPlacement.fontSize} onChange={(event) => setTrophyPlacement((current) => ({ ...current, fontSize: event.target.value }))} style={input} /></label><label>Text color<input type="color" value={trophyPlacement.color} onChange={(event) => setTrophyPlacement((current) => ({ ...current, color: event.target.value }))} style={colorInput} /></label><label>Alignment<select value={trophyPlacement.align} onChange={(event) => setTrophyPlacement((current) => ({ ...current, align: event.target.value }))} style={input}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label></div><div style={row}><button type="button" disabled={!trophyFile} onClick={() => void personalizeTrophy("preview")} style={secondary}>PREVIEW PERSONALIZED PNG</button><button type="button" disabled={!trophyFile} onClick={() => void personalizeTrophy("save")} style={button}>SAVE PENDING AWARD</button><button type="button" disabled={!trophyAwardId} onClick={() => void approveTrophy()} style={secondary}>APPROVE AWARD</button>{trophyDownloadUrl && <a href={trophyDownloadUrl} target="_blank" rel="noreferrer" style={link}>Download rendered trophy →</a>}</div>{trophyPreview && <div><p style={muted}>Rendered preview for the verified final winner:</p><img src={trophyPreview} alt="Personalized trophy preview" style={trophyPreviewImage} /></div>}</section>
  </div></main>
}

const page: React.CSSProperties = { minHeight: "100vh", background: "#05070b", color: "#f8fafc", padding: "30px 16px 80px" }
const shell: React.CSSProperties = { maxWidth: 1000, margin: "0 auto" }
const link: React.CSSProperties = { color: "#f0abfc", textDecoration: "none", fontWeight: 800 }
const eyebrow: React.CSSProperties = { marginTop: 28, color: "#f0abfc", letterSpacing: ".16em", textTransform: "uppercase", fontSize: 12, fontWeight: 800 }
const muted: React.CSSProperties = { color: "#94a3b8", lineHeight: 1.6 }
const notice: React.CSSProperties = { margin: "16px 0", padding: 12, borderRadius: 10, background: "#3b2f12", color: "#fde68a" }
const panel: React.CSSProperties = { marginTop: 16, padding: 18, borderRadius: 16, background: "#101722", border: "1px solid #293244" }
const card: React.CSSProperties = { display: "grid", gap: 8, padding: 13, marginTop: 10, borderRadius: 11, background: "#0b111c" }
const roster: React.CSSProperties = { display: "grid", gap: 6, margin: "14px 0" }
const rosterRow: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 11px", borderRadius: 8, background: "#0b111c", color: "#e2e8f0" }
const manual: React.CSSProperties = { marginTop: 16, padding: 12, border: "1px dashed #64748b", borderRadius: 10 }
const input: React.CSSProperties = { width: "100%", minHeight: 55, padding: 9, borderRadius: 8, border: "1px solid #475569", background: "#070b12", color: "white" }
const row: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" }
const button: React.CSSProperties = { border: 0, borderRadius: 999, padding: "8px 11px", background: "#f0abfc", color: "#24102c", fontWeight: 900, fontSize: 11 }
const secondary: React.CSSProperties = { ...button, background: "#1e293b", color: "white", border: "1px solid #64748b" }
const tiny: React.CSSProperties = { border: "1px solid #64748b", borderRadius: 7, padding: "4px 8px", background: "#1e293b", color: "white" }
const trophyControls: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginTop: 12 }
const colorInput: React.CSSProperties = { display: "block", width: "100%", height: 55, marginTop: 6, padding: 4, border: "1px solid #475569", borderRadius: 8, background: "#070b12" }
const trophyPreviewImage: React.CSSProperties = { display: "block", maxWidth: "100%", maxHeight: 360, marginTop: 12, objectFit: "contain", borderRadius: 12, border: "1px solid #475569" }
