"use client"

import { useMemo, useState } from "react"

import { EighteenHoleEditor } from "./EighteenHoleEditor"
import { ScorecardEvidenceViewer } from "./ScorecardEvidenceViewer"

type Review = {
  evidence: { id: string; original_filename: string; submitted_at: string; signedUrl: string }
  context: { adapter_key: string; season_number: number | null; division_label: string | null; game_number: number | null; round_label: string | null; course_name_snapshot: string; difficulty: string; par_snapshot: number[]; arranged_played_date: string | null; event_played_date: string | null }
  participants: Array<{ id: string; display_name_snapshot: string }>
  cards: Array<{ participant_id: string; played_date: string; card_date_text: string | null; shared_scorecard_holes: Array<{ hole_number: number; strokes: number }> }>
}

export function SharedScorecardReviewer({ review, onSaved }: { review: Review; onSaved: () => void }) {
  const initialHoles = useMemo(() => new Map(review.cards.map((card) => [card.participant_id, [...card.shared_scorecard_holes].sort((a, b) => a.hole_number - b.hole_number).map((hole) => String(hole.strokes))])), [review.cards])
  const [holes, setHoles] = useState<Record<string, string[]>>(() => Object.fromEntries(review.participants.map((participant) => [participant.id, initialHoles.get(participant.id) || Array(18).fill("")])))
  const authoritativeDate = review.context.arranged_played_date || review.context.event_played_date
  const [playedDate, setPlayedDate] = useState(review.cards[0]?.played_date || authoritativeDate || "")
  const [rawDate, setRawDate] = useState(review.cards[0]?.card_date_text || "")
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  async function save(action: "draft" | "verify") {
    setBusy(true); setMessage("")
    try {
      const response = await fetch("/api/admin/scorecards", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        evidenceId: review.evidence.id,
        playedDate,
        rawCardDateText: rawDate,
        changeReason: reason,
        action,
        cards: review.participants.map((participant) => ({ participantId: participant.id, componentKey: "primary", holes: holes[participant.id].map((value, index) => ({ holeNumber: index + 1, par: review.context.par_snapshot[index], strokes: Number(value) })) })),
      }) })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error || "Review could not be saved.")
      setMessage(action === "verify" ? "Verified and committed to the league result." : "Draft saved.")
      onSaved()
    } catch (error) { setMessage(error instanceof Error ? error.message : "Review could not be saved.") }
    finally { setBusy(false) }
  }

  return <div className="space-y-5 text-white">
    <header className="rounded-2xl border border-cyan-300/20 bg-gradient-to-r from-slate-950 to-cyan-950/50 p-5"><span className="text-xs font-bold tracking-[0.25em] text-cyan-300">ADMIN SCORECARD REVIEWER</span><h2 className="mt-1 text-3xl font-black">{review.context.adapter_key.toUpperCase()} · {review.context.division_label || review.context.round_label || "SCORECARD"}</h2><p className="mt-2 text-slate-300">Season {review.context.season_number ?? "—"} · Game {review.context.game_number ?? "—"} · {review.context.course_name_snapshot} {review.context.difficulty}</p></header>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,.85fr)]">
      <ScorecardEvidenceViewer src={review.evidence.signedUrl} label={review.evidence.original_filename} />
      <aside className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/55 p-5">
        <h3 className="text-xl font-black">Competition context</h3>
        <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-400">Players</dt><dd>{review.participants.map((item) => item.display_name_snapshot).join(" vs ")}</dd></div><div><dt className="text-slate-400">Submitted At</dt><dd>{new Date(review.evidence.submitted_at).toLocaleString()}</dd></div><div><dt className="text-slate-400">Course</dt><dd>{review.context.course_name_snapshot}</dd></div><div><dt className="text-slate-400">Difficulty</dt><dd>{review.context.difficulty}</dd></div></dl>
        <label className="block text-sm font-bold">Played Date<input className="mt-1 block w-full rounded-lg border border-white/15 bg-slate-900 p-3" type="date" value={playedDate} disabled={Boolean(authoritativeDate) || busy} onChange={(event) => setPlayedDate(event.target.value)} /></label>
        <p className="text-xs text-slate-400">{authoritativeDate ? "Locked to the authoritative scheduled/event date." : "No authoritative scheduled date exists; admin calendar selection is required."}</p>
        <label className="block text-sm font-bold">Raw Card Date Text<input className="mt-1 block w-full rounded-lg border border-white/15 bg-slate-900 p-3" value={rawDate} disabled={busy} onChange={(event) => setRawDate(event.target.value)} placeholder="Preserve exactly as printed; never auto-parsed" /></label>
        <label className="block text-sm font-bold">Correction / review note<textarea className="mt-1 block min-h-24 w-full rounded-lg border border-white/15 bg-slate-900 p-3" value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} /></label>
      </aside>
    </div>
    {review.participants.map((participant) => <EighteenHoleEditor key={participant.id} playerName={participant.display_name_snapshot} pars={review.context.par_snapshot} values={holes[participant.id]} disabled={busy} onChange={(index, value) => setHoles((current) => ({ ...current, [participant.id]: current[participant.id].map((entry, holeIndex) => holeIndex === index ? value : entry) }))} />)}
    {message && <p role="status" className="rounded-xl border border-cyan-300/20 bg-cyan-950/35 p-3">{message}</p>}
    <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={() => void save("draft")} className="rounded-xl border border-cyan-300/40 px-5 py-3 font-black">SAVE DRAFT</button><button type="button" disabled={busy || !playedDate} onClick={() => void save("verify")} className="rounded-xl bg-lime-300 px-5 py-3 font-black text-slate-950">VERIFY / SAVE RESULT</button><button type="button" disabled={busy} onClick={onSaved} className="rounded-xl border border-white/20 px-5 py-3 font-black">CANCEL</button></div>
  </div>
}
