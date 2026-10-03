"use client"

import { useMemo, useState } from "react"
import { EighteenHoleEditor } from "./EighteenHoleEditor"
import { ScorecardEvidenceViewer } from "./ScorecardEvidenceViewer"

type Review = {
  evidence: { id: string; component_key?: string; original_filename: string; submitted_at: string; signedUrl: string }
  evidenceItems?: Array<{ id: string; component_key: string; original_filename: string; submitted_at: string; signedUrl: string }>
  context: { adapter_key: string; season_number: number | null; division_label: string | null; game_number: number | null; round_label: string | null; course_name_snapshot: string; difficulty: string; par_snapshot: number[]; arranged_played_date: string | null; event_played_date: string | null }
  components?: Array<{ component_key: string; course_name_snapshot: string; difficulty: string; par_snapshot: number[] }>
  participants: Array<{ id: string; role_key: string; display_name_snapshot: string }>
  cards: Array<{ id: string; participant_id: string; component_key: string; played_date: string; card_date_text: string | null; shared_scorecard_holes: Array<{ hole_number: number; par: number; strokes: number }> }>
}

export function SharedScorecardReviewer({ review, onSaved }: { review: Review; onSaved: () => void }) {
  const activeComponent = review.context.adapter_key === "pyp" ? (review.evidence.component_key === "course2" ? "course2" : "course1") : review.context.adapter_key === "match" ? (review.evidence.component_key || "primary") : "primary"
  const componentForParticipant = (participant: Review["participants"][number]) => review.context.adapter_key === "pyp" ? activeComponent : review.context.adapter_key === "match" ? participant.role_key : "primary"
  const component = review.components?.find((item) => item.component_key === activeComponent)
  const pars = component?.par_snapshot || review.context.par_snapshot
  const evidenceItems = review.evidenceItems?.length ? review.evidenceItems : [review.evidence]
  const initialHoles = useMemo(() => new Map(review.cards.map((card) => [`${card.participant_id}:${card.component_key}`, [...card.shared_scorecard_holes].sort((a, b) => a.hole_number - b.hole_number).map((hole) => String(hole.strokes))])), [review.cards])
  const [holes, setHoles] = useState<Record<string, string[]>>(() => Object.fromEntries(review.participants.map((participant) => [participant.id, initialHoles.get(`${participant.id}:${componentForParticipant(participant)}`) || Array(18).fill("")])) )
  const authoritativeDate = review.context.arranged_played_date || review.context.event_played_date
  const [playedDate, setPlayedDate] = useState(review.cards[0]?.played_date || authoritativeDate || "")
  const [rawDate, setRawDate] = useState(review.cards[0]?.card_date_text || "")
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  async function save(action: "draft" | "verify") {
    setBusy(true); setMessage("")
    try {
      const response = await fetch("/api/admin/scorecards", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evidenceId: review.evidence.id, playedDate, rawCardDateText: rawDate, changeReason: reason, action, cards: review.participants.map((participant) => { const componentKey = componentForParticipant(participant); const componentPars = review.components?.find((item) => item.component_key === componentKey)?.par_snapshot || review.context.par_snapshot; const evidenceId = evidenceItems.find((item) => item.component_key === componentKey)?.id || review.evidence.id; return { participantId: participant.id, componentKey, evidenceId, holes: holes[participant.id].map((value, index) => ({ holeNumber: index + 1, par: componentPars[index], strokes: Number(value) })) } }) }) })
      const payload = await response.json() as { error?: string; waitingForComponents?: boolean }
      if (!response.ok) throw new Error(payload.error || "Review could not be saved.")
      if (payload.waitingForComponents) { setMessage("Course saved. Review the other course before verifying the PYP result."); return }
      setMessage(action === "verify" ? "Verified and committed to the authoritative league result." : "Draft saved."); onSaved()
    } catch (error) { setMessage(error instanceof Error ? error.message : "Review could not be saved.") } finally { setBusy(false) }
  }

  return <div className="space-y-5 text-white">
    <header className="rounded-2xl border border-cyan-300/20 bg-gradient-to-r from-slate-950 to-cyan-950/50 p-5"><span className="text-xs font-bold tracking-[0.25em] text-cyan-300">ADMIN SCORECARD REVIEWER</span><h2 className="mt-1 text-3xl font-black">{review.context.adapter_key.toUpperCase()} · {review.context.division_label || review.context.round_label || "SCORECARD"}</h2><p className="mt-2 text-slate-300">Season {review.context.season_number ?? "—"} · Game {review.context.game_number ?? "—"}</p></header>
    <div className="grid gap-4 md:grid-cols-2">{evidenceItems.map((item) => <section key={item.id}><h3 className="mb-2 text-lg font-black">{item.component_key === "course1" ? "COURSE 1 SCORECARD" : item.component_key === "course2" ? "COURSE 2 SCORECARD" : "SCORECARD EVIDENCE"}</h3><ScorecardEvidenceViewer src={item.signedUrl} label={item.original_filename} /></section>)}</div>
    <aside className="rounded-2xl border border-white/10 bg-slate-950/55 p-5"><h3 className="text-xl font-black">Fixture context · {activeComponent === "course2" ? "Course 2" : activeComponent === "course1" ? "Course 1" : review.context.course_name_snapshot}</h3><p className="mt-2 text-slate-300">{review.context.division_label || "—"} · Game {review.context.game_number ?? "—"} · {component?.course_name_snapshot || review.context.course_name_snapshot} {component?.difficulty || review.context.difficulty}</p><label className="mt-4 block text-sm font-bold">Played Date<input className="mt-1 block w-full rounded-lg border border-white/15 bg-slate-900 p-3" type="date" value={playedDate} disabled={Boolean(authoritativeDate) || busy} onChange={(event) => setPlayedDate(event.target.value)} /></label><label className="mt-4 block text-sm font-bold">Raw Card Date Text<input className="mt-1 block w-full rounded-lg border border-white/15 bg-slate-900 p-3" value={rawDate} disabled={busy} onChange={(event) => setRawDate(event.target.value)} /></label><label className="mt-4 block text-sm font-bold">Correction / review note<textarea className="mt-1 block min-h-20 w-full rounded-lg border border-white/15 bg-slate-900 p-3" value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} /></label></aside>
    {review.participants.map((participant) => { const participantComponent = componentForParticipant(participant); const participantPars = review.components?.find((item) => item.component_key === participantComponent)?.par_snapshot || pars; return <EighteenHoleEditor key={participant.id} playerName={`${participantComponent === "course2" ? "COURSE 2 · " : participantComponent === "course1" ? "COURSE 1 · " : ""}${participant.display_name_snapshot}`} pars={participantPars} values={holes[participant.id]} disabled={busy} onChange={(index, value) => setHoles((current) => ({ ...current, [participant.id]: current[participant.id].map((entry, holeIndex) => holeIndex === index ? value : entry) }))} /> })}
    {message && <p role="status" className="rounded-xl border border-cyan-300/20 bg-cyan-950/35 p-3">{message}</p>}
    <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={() => void save("draft")} className="rounded-xl border border-cyan-300/40 px-5 py-3 font-black">SAVE DRAFT</button><button type="button" disabled={busy || !playedDate || Object.values(holes).some((values) => values.some((value) => !Number(value)))} onClick={() => void save("verify")} className="rounded-xl bg-lime-300 px-5 py-3 font-black text-slate-950">VERIFY / SAVE RESULT</button><button type="button" disabled={busy} onClick={onSaved} className="rounded-xl border border-white/20 px-5 py-3 font-black">CANCEL</button></div>
  </div>
}
