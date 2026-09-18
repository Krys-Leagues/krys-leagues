"use client"

import { useState } from "react"

import { SharedScorecardReviewer } from "./SharedScorecardReviewer"

export type ScorecardQueueItem = { id: string; review_status: string; submitted_at: string; original_filename: string; shared_scorecard_contexts: { adapter_key: string; season_number: number | null; division_label: string | null; game_number: number | null; course_name_snapshot: string; difficulty: string } | null }

export function AdminScorecardsClient({ initialQueue, initialError }: { initialQueue: ScorecardQueueItem[]; initialError: string }) {
  const [queue, setQueue] = useState(initialQueue)
  const [review, setReview] = useState<React.ComponentProps<typeof SharedScorecardReviewer>["review"] | null>(null)
  const [error, setError] = useState(initialError)
  async function loadQueue() {
    const response = await fetch("/api/admin/scorecards", { cache: "no-store" })
    const payload = await response.json() as { queue?: ScorecardQueueItem[]; error?: string }
    if (!response.ok) throw new Error(payload.error || "Review queue unavailable.")
    setQueue(payload.queue || [])
  }
  async function open(id: string) {
    setError("")
    const response = await fetch(`/api/admin/scorecards?id=${encodeURIComponent(id)}`, { cache: "no-store" })
    const payload = await response.json()
    if (!response.ok) { setError(payload.error || "Review unavailable."); return }
    setReview(payload)
  }
  if (review) return <main className="min-h-screen bg-[#06111e] p-4 md:p-8"><div className="mx-auto max-w-[1600px]"><SharedScorecardReviewer review={review} onSaved={() => { setReview(null); void loadQueue().catch((caught) => setError(caught instanceof Error ? caught.message : "Review queue unavailable.")) }} /></div></main>
  return <main className="min-h-screen bg-[#06111e] p-4 text-white md:p-8"><div className="mx-auto max-w-6xl"><header className="mb-6"><span className="text-xs font-bold tracking-[0.25em] text-cyan-300">KRYS LEAGUES ADMIN</span><h1 className="text-4xl font-black">SCORECARD REVIEW</h1><p className="mt-2 text-slate-300">One private review queue for every scorecard adapter. League rules remain isolated.</p></header>{error && <p role="alert" className="mb-4 rounded-xl border border-rose-400/30 bg-rose-950/40 p-4">{error}</p>}<div className="grid gap-3">{queue.map((item) => { const context = item.shared_scorecard_contexts; return <button type="button" key={item.id} onClick={() => void open(item.id)} className="grid gap-2 rounded-2xl border border-white/10 bg-slate-950/60 p-5 text-left hover:border-cyan-300/50 md:grid-cols-[1fr_auto]"><span><strong className="block text-xl">{context?.adapter_key.toUpperCase()} · {context?.division_label || "SCORECARD"}</strong><span className="text-slate-300">Season {context?.season_number ?? "—"} · Game {context?.game_number ?? "—"} · {context?.course_name_snapshot} {context?.difficulty}</span></span><span className="font-bold text-cyan-300">{item.review_status.replaceAll("_", " ").toUpperCase()} →</span></button>})}{queue.length === 0 && !error && <p className="rounded-2xl border border-white/10 bg-slate-950/60 p-8 text-center text-slate-300">No scorecards are waiting for review.</p>}</div></div></main>
}
