"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import type { StrokeDivisionBoard } from "@/lib/scorecards/strokePilot"
import { SharedScorecardReviewer } from "./SharedScorecardReviewer"

const accents: Record<number, string> = { 1: "#fb923c", 2: "#60a5fa", 3: "#4ade80", 4: "#facc15", 5: "#c084fc" }

export function ManageStrokeSeasonClient() {
  const [boards, setBoards] = useState<StrokeDivisionBoard[]>([])
  const [division, setDivision] = useState(1)
  const [review, setReview] = useState<React.ComponentProps<typeof SharedScorecardReviewer>["review"] | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const response = await fetch("/api/admin/stroke/manage", { cache: "no-store" })
    const payload = await response.json() as { boards?: StrokeDivisionBoard[]; error?: string }
    if (!response.ok) throw new Error(payload.error || "The current Stroke workspace is unavailable.")
    setBoards(payload.boards || [])
    setDivision((current) => payload.boards?.some((board) => board.division === current) ? current : payload.boards?.[0]?.division || 1)
    setLoading(false)
  }
  useEffect(() => {
    let active = true
    void fetch("/api/admin/stroke/manage", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { boards?: StrokeDivisionBoard[]; error?: string }
        if (!response.ok) throw new Error(payload.error || "The current Stroke workspace is unavailable.")
        return payload.boards || []
      })
      .then((initialBoards) => {
        if (!active) return
        setBoards(initialBoards)
        setDivision(initialBoards[0]?.division || 1)
        setLoading(false)
      })
      .catch((caught) => {
        if (!active) return
        setError(caught instanceof Error ? caught.message : "The current Stroke workspace is unavailable.")
        setLoading(false)
      })
    return () => { active = false }
  }, [])

  async function openReview(evidenceId: string) {
    const response = await fetch(`/api/admin/scorecards?id=${encodeURIComponent(evidenceId)}`, { cache: "no-store" })
    const payload = await response.json()
    if (!response.ok) { setError(payload.error || "The scorecard review is unavailable."); return }
    setReview(payload)
  }

  if (review) return <main className="min-h-screen bg-[#06111e] p-4 md:p-8"><div className="mx-auto max-w-[1600px]"><button type="button" onClick={() => setReview(null)} className="mb-4 text-sm font-bold text-cyan-300">← MANAGE CURRENT SEASON</button><SharedScorecardReviewer review={review} onSaved={() => { setReview(null); void load().catch(() => setError("The saved result is safe, but the workspace could not refresh.")) }} /></div></main>
  const board = boards.find((candidate) => candidate.division === division)
  return <main className="min-h-screen bg-[#06111e] p-4 text-white md:p-8"><div className="mx-auto max-w-7xl">
    <Link href="/admin/stroke" className="text-sm font-bold text-cyan-300">← STROKE ADMIN</Link>
    <header className="my-6"><span className="text-xs font-bold tracking-[0.24em] text-cyan-300">KRYS LEAGUES ADMIN</span><h1 className="text-4xl font-black">MANAGE CURRENT SEASON</h1><p className="mt-2 text-slate-300">Authoritative Stroke assignments, scorecard review, results, standings, and live-board retry in one workspace.</p></header>
    {error && <p role="alert" className="mb-4 rounded-xl border border-rose-400/30 bg-rose-950/40 p-4">{error}</p>}
    {loading && <p>Loading current managed Stroke season…</p>}
    <nav className="mb-5 flex flex-wrap gap-2">{boards.map((candidate) => <button type="button" key={candidate.division} onClick={() => setDivision(candidate.division)} className="rounded-full border px-5 py-2 font-black" style={{ borderColor: accents[candidate.division], color: candidate.division === division ? "#020617" : accents[candidate.division], background: candidate.division === division ? accents[candidate.division] : "transparent" }}>D{candidate.division}</button>)}</nav>
    {board && <section className="rounded-3xl border bg-slate-950/70 p-4 md:p-7" style={{ borderColor: accents[board.division] }}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-3xl font-black" style={{ color: accents[board.division] }}>STROKE DIVISION {board.division}</h2><p className="text-slate-300">SEASON {board.seasonNumber}</p></div><button type="button" onClick={() => void fetch("/api/admin/stroke/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seasonId: board.seasonId, division: board.division }) }).then((response) => { if (!response.ok) throw new Error(); setError("") }).catch(() => setError("The Discord board retry could not be queued."))} className="rounded-xl border border-cyan-300/40 px-4 py-2 text-sm font-bold text-cyan-300">RETRY LIVE BOARD SYNC</button></div>
      <h3 className="mb-3 text-xl font-black">COURSE ASSIGNMENTS</h3><div className="grid gap-3">{board.games.map((game) => <article key={game.sourceKey} className="grid gap-3 rounded-2xl border border-white/10 bg-slate-900/70 p-4 md:grid-cols-[80px_1fr_1fr_1fr_auto] md:items-center"><strong>GAME {game.gameNumber}</strong><span className="break-words font-bold">{game.playerOne}</span><span className="break-words font-bold">{game.playerTwo}</span><span>{game.course}</span><span className="flex flex-wrap items-center gap-2"><strong className={game.state === "SCORECARD RECEIVED" ? "text-cyan-300" : game.state === "COMPLETED" ? "text-emerald-300" : "text-slate-300"}>{game.state}</strong>{game.state === "COMPLETED" && <span>{game.playerOneScore} / {game.playerTwoScore}</span>}{game.state === "SCORECARD RECEIVED" && game.reviewEvidenceId && <button type="button" onClick={() => void openReview(game.reviewEvidenceId!)} className="rounded-lg bg-cyan-300 px-3 py-2 text-xs font-black text-slate-950">OPEN SCORECARD</button>}{game.state === "NOT PLAYED" && <Link href={`/admin/stroke/results?seasonId=${encodeURIComponent(board.seasonId)}`} className="rounded-lg border border-white/20 px-3 py-2 text-xs font-black">MANUAL SCORING</Link>}</span></article>)}</div>
      <h3 className="mb-3 mt-8 text-xl font-black">CURRENT STANDINGS</h3><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left"><thead><tr className="text-xs uppercase tracking-wider text-slate-400">{["Rank","Player","GP","W","L","T","STROKES","PTS"].map((label) => <th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{board.standings.map((standing) => <tr key={`${standing.rank}-${standing.player}`} className="border-t border-white/10"><td className="p-3 font-black">{standing.rank}</td><td className="p-3 font-bold">{standing.player}</td><td className="p-3">{standing.gp}</td><td className="p-3">{standing.wins}</td><td className="p-3">{standing.losses}</td><td className="p-3">{standing.ties}</td><td className="p-3">{standing.strokes}</td><td className="p-3 font-black">{standing.points}</td></tr>)}</tbody></table></div>
    </section>}
  </div></main>
}
