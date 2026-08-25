"use client"

import { useEffect, useMemo, useState } from "react"

import ExistingPlayerPicker from "@/app/admin/import/csv/components/ExistingPlayerPicker"
import type { ExistingPlayerSearchResult } from "@/lib/importer/historicalMatchIdentity"
import { historicalProSeasonIdentityBlockers, historicalProSeasonReadyRows, type HistoricalProIdentityReview, type HistoricalProPreview } from "@/lib/importer/adapters/historicalProParser"
import { supabase } from "@/lib/supabase"

type ManualDecision = ExistingPlayerSearchResult

function statusClass(status: string) {
  if (status.includes("CURRENT") || status.includes("BLOCKED") || status.includes("CONFLICT")) return "text-amber-300"
  if (status.includes("MISSING")) return "text-red-300"
  return "text-emerald-300"
}

export default function HistoricalProImporterPage() {
  const [preview, setPreview] = useState<HistoricalProPreview | null>(null)
  const [reviews, setReviews] = useState<HistoricalProIdentityReview[]>([])
  const [decisions, setDecisions] = useState<Record<string, ManualDecision>>({})
  const [searching, setSearching] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [showAllRows, setShowAllRows] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        if (!token) throw new Error("Sign in as a site admin to open Historical Pro review.")
        const response = await fetch("/api/admin/historical-pro", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
        const body = await response.json() as { error?: string; preview?: HistoricalProPreview; identityReviews?: HistoricalProIdentityReview[] }
        if (!response.ok || !body.preview || !body.identityReviews) throw new Error(body.error || "Historical Pro preview could not be loaded.")
        if (!cancelled) { setPreview(body.preview); setReviews(body.identityReviews); setLoading(false) }
      } catch (loadError) {
        if (!cancelled) { setError(loadError instanceof Error ? loadError.message : "Historical Pro preview could not be loaded."); setLoading(false) }
      }
    })()
    return () => { cancelled = true }
  }, [])

  const effectiveReviews = useMemo(() => reviews.map((review) => {
    const decision = decisions[review.historicalPlayerName]
    return decision ? { ...review, status: "resolved" as const, canonicalPlayerId: decision.id, canonicalPlayerName: decision.screen_name, matchedSource: "manual review", confidence: 100 } : review
  }), [decisions, reviews])
  const blockers = preview ? historicalProSeasonIdentityBlockers(preview, effectiveReviews) : []
  const readyRows = preview ? historicalProSeasonReadyRows(preview, effectiveReviews) : []
  const identityRows = [...effectiveReviews].sort((left, right) => Number(left.status === "resolved") - Number(right.status === "resolved") || left.historicalPlayerName.localeCompare(right.historicalPlayerName))
  const visibleRows = showAllRows ? preview?.seasonRows ?? [] : (preview?.seasonRows ?? []).slice(0, 120)

  function selectPlayer(name: string, player: ExistingPlayerSearchResult) {
    setDecisions((current) => ({ ...current, [name]: player }))
    setSearching(null)
  }

  if (loading) return <main className="mx-auto max-w-7xl p-8 text-zinc-300">Loading protected Historical Pro review…</main>
  if (error) return <main className="mx-auto max-w-7xl p-8"><div role="alert" className="rounded border border-red-700 bg-red-950/40 p-4 text-red-200">{error}</div></main>
  if (!preview) return null

  return <main className="mx-auto max-w-7xl space-y-6 p-8">
    <header>
      <p className="text-sm font-bold uppercase tracking-widest text-cyan-300">Protected site-admin review</p>
      <h1 className="mt-2 text-4xl font-bold">Historical Pro importer</h1>
      <p className="mt-2 max-w-4xl text-zinc-400">Read-only Global Player identity review for completed Pro Seasons 1–12. Exact historical names, source-published ranks, positive/negative score text, format eras, and source provenance remain unchanged. Weeks and Season 13 are outside this review.</p>
    </header>

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[['Season player-period rows', preview.seasonAudit.playerPeriodRows], ['Season Easy/Hard observations', preview.seasonAudit.sourceEasyHardScoreObservations], ['Eligible Easy/Hard observations', preview.seasonAudit.easyScoreObservations + preview.seasonAudit.hardScoreObservations], ['Season exact names', preview.seasonAudit.exactHistoricalNames]].map(([label, value]) => <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4" key={String(label)}><div className="text-sm text-zinc-400">{label}</div><div className="mt-1 text-2xl font-bold">{value}</div></div>)}
      <div className="rounded-lg border border-emerald-800 bg-emerald-950/30 p-4"><div className="text-sm text-zinc-400">Eligible Season scorecard rows</div><div className="mt-1 text-2xl font-bold text-emerald-300">{preview.seasonAudit.importableRows}</div></div>
      <div className="rounded-lg border border-amber-800 bg-amber-950/30 p-4"><div className="text-sm text-zinc-400">Season missing-score rows blocked</div><div className="mt-1 text-2xl font-bold text-amber-300">{preview.seasonAudit.blockedMissingScoreRows}</div></div>
      <div className="rounded-lg border border-red-800 bg-red-950/30 p-4"><div className="text-sm text-zinc-400">Season conflict rows blocked</div><div className="mt-1 text-2xl font-bold text-red-300">{preview.seasonAudit.blockedConflictRows}</div></div>
      <div className="rounded-lg border border-amber-800 bg-amber-950/30 p-4"><div className="text-sm text-zinc-400">Season 13 rows</div><div className="mt-1 font-bold text-amber-300">CURRENT / INCOMPLETE</div></div>
    </section>

    <section className="rounded-xl border border-zinc-700 bg-zinc-900 p-5">
      <h2 className="text-2xl font-bold">Source and period protection</h2>
      <div className="mt-3 space-y-1 break-all font-mono text-xs text-zinc-400"><div>Parser: {preview.parserVersion}</div><div>SHA-256: {preview.sourceSha256 ?? "—"}</div><div>Manifest SHA-256: {preview.expectedSourceSha256 ?? "—"} · {preview.sourceShaMatches ? "MATCH" : "MISMATCH"}</div></div>
      <div className="mt-4 grid gap-2 md:grid-cols-2"><div><strong>Missing source periods:</strong> {preview.missingPeriods.map((period) => period.periodLabel).join(", ") || "none"}</div><div><strong>Current periods:</strong> {preview.currentPeriods.map((period) => `${period.periodLabel} — ${period.status}`).join("; ") || "none"}</div></div>
      <p className="mt-4 text-sm text-amber-200">Season 13 is evidence-only and cannot enter a historical payload. Week 107’s 34 conflicting keys / 68 raw observations remain blocked; non-conflicting Week history remains preserved but is excluded from this Season identity review. The normalized scorecard file contains {preview.audit.normalizedPlayerPeriodRows} grouped player-periods overall; this page reviews only the {preview.seasonPlayerPeriods.length} completed Season 1–12 player-periods.</p>
    </section>

    <section className="rounded-xl border border-zinc-700 bg-zinc-900 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-bold">Global Player identity review</h2><p className="mt-1 text-sm text-zinc-400">Unresolved and ambiguous names are first. Suggestions never become automatic links; manual linking here changes review state only.</p></div><div className="text-sm"><span className="text-emerald-300">Resolved {effectiveReviews.filter((review) => review.status === "resolved").length}</span> · <span className="text-amber-300">Ambiguous {effectiveReviews.filter((review) => review.status === "ambiguous").length}</span> · <span className="text-red-300">Unresolved {effectiveReviews.filter((review) => review.status === "unresolved").length}</span></div></div>
      <div className="mt-4 space-y-3">{identityRows.map((review) => <article className={`rounded-lg border p-4 ${review.status === "resolved" ? "border-emerald-900" : "border-amber-500"}`} key={review.historicalPlayerName}><div className="flex flex-wrap justify-between gap-3"><div><strong>{review.historicalPlayerName}</strong><div className="text-xs text-zinc-500">{preview.seasonRows.filter((row) => row.historicalPlayerName === review.historicalPlayerName && row.importable).length} eligible scorecard rows</div>{review.status === "ambiguous" && review.candidatePlayerName && <div className="mt-1 text-sm text-amber-200">Candidate Global Player: {review.candidatePlayerName} ({review.confidence}% suggestion; {review.matchedSource})</div>}</div><div className={review.status === "resolved" ? "text-emerald-300" : "text-amber-300"}>{review.status === "resolved" ? `Resolved to ${review.canonicalPlayerName}` : review.status === "ambiguous" ? "Ambiguous suggestion — review required" : "Unresolved — review required"}</div></div>{review.status !== "resolved" && <div className="mt-2 flex flex-wrap gap-2"><button type="button" className="rounded bg-blue-700 px-3 py-2 font-bold" onClick={() => setSearching(review.historicalPlayerName)}>Find / Link Existing Global Player</button>{searching === review.historicalPlayerName && <ExistingPlayerPicker historicalDisplayName={review.historicalPlayerName} selectLabel="Approve for Pro review" onCancel={() => setSearching(null)} onSelect={(player) => selectPlayer(review.historicalPlayerName, player)} />}</div>}</article>)}</div>
    </section>

    <section className="rounded-xl border border-zinc-700 bg-zinc-900 p-5"><h2 className="text-2xl font-bold">Opponent pairing evidence</h2><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><div>Source-color confirmed: <strong className="text-emerald-300">{preview.pairingSummary.sourceColorConfirmed}</strong></div><div>Played: <strong>{preview.pairingSummary.played}</strong></div><div>Scheduled / unplayed: <strong>{preview.pairingSummary.scheduledUnplayed}</strong></div><div>Partial-score review: <strong className="text-amber-300">{preview.pairingSummary.partialScoreReview}</strong></div><div>Manual / ambiguous: <strong className="text-amber-300">{preview.pairingSummary.manualReview}</strong></div><div>Unknown allowed: <strong>{preview.pairingSummary.unknown}</strong></div></div><p className="mt-4 text-sm text-zinc-400">Color evidence is never inferred from row background, scores, rank, W/L/D, or row order. The Season 1–12 row-level artifact is attached and preserves exact source rows, cells, colors, states, and provenance; no opponent is guessed from the scorecard.</p></section>

    <section className="rounded-xl border border-zinc-700 bg-zinc-900 p-5"><h2 className="text-2xl font-bold">Scorecard preview</h2><div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-xs"><thead><tr className="border-b border-zinc-700 text-zinc-400">{["Period", "Division", "Exact name", "Game", "Map", "Easy", "Hard", "Total", "W/L/D", "PTS", "Published rank", "Era", "State"].map((header) => <th className="p-2" key={header}>{header}</th>)}</tr></thead><tbody>{visibleRows.map((row) => <tr className="border-b border-zinc-800 align-top" key={row.sourceFingerprint}><td className="p-2">{row.periodLabel}</td><td className="p-2">{row.division}</td><td className="p-2 font-bold">{row.historicalPlayerName}</td><td className="p-2">G{row.gameNumber}</td><td className="p-2">{row.mapCourseCode ?? "—"}</td><td className="p-2">{row.easyScore ?? "—"}</td><td className="p-2">{row.hardScore ?? "—"}</td><td className="p-2">{row.combinedTotal ?? "—"}</td><td className="p-2">{row.wins ?? "—"}/{row.losses ?? "—"}/{row.draws ?? "—"}</td><td className="p-2">{row.points ?? "—"}</td><td className="p-2">{row.publishedRank ?? "—"}</td><td className="p-2">{row.sourceEra}</td><td className={`p-2 font-bold ${statusClass(row.reviewStatus)}`}>{row.reviewStatus}</td></tr>)}</tbody></table></div><button type="button" className="mt-3 rounded border border-zinc-600 px-3 py-2" onClick={() => setShowAllRows((value) => !value)}>{showAllRows ? "Show first 120 rows" : `Show all ${preview.rows.length} rows`}</button></section>

    <section className="rounded-xl border border-zinc-700 bg-zinc-950 p-5"><h2 className="text-2xl font-bold">Season 1–12 identity-review readiness</h2><div className="mt-3 grid gap-2 sm:grid-cols-3"><div>Resolved score rows: <strong>{readyRows.length}</strong></div><div>Identity blockers: <strong className={blockers.length ? "text-amber-300" : "text-emerald-300"}>{blockers.length}</strong></div><div>Partial pairing reviews: <strong className="text-amber-300">{preview.pairingSummary.partialScoreReview}</strong></div></div>{blockers.length > 0 && <p className="mt-3 text-amber-200">Review every unresolved/ambiguous name attached to an eligible Season 1–12 score row before any future commit. This page does not commit scores or change identities automatically.</p>}<button type="button" disabled className="mt-4 rounded bg-zinc-700 px-5 py-3 font-bold text-zinc-400">Commit Historical Pro scores (identity review only)</button></section>
  </main>
}
