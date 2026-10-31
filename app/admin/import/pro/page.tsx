"use client"

import { useEffect, useMemo, useState } from "react"

import ExistingPlayerPicker from "@/app/admin/import/csv/components/ExistingPlayerPicker"
import type { ExistingPlayerSearchResult } from "@/lib/importer/historicalMatchIdentity"
import { HISTORICAL_PRO_PARSER_VERSION, historicalProSeasonIdentityBlockers, historicalProSeasonReadyRows, type HistoricalProIdentityReview, type HistoricalProPreview, type HistoricalProSeasonPairing, type HistoricalProSourceRow } from "@/lib/importer/adapters/historicalProParser"
import { supabase } from "@/lib/supabase"

type ManualDecision = ExistingPlayerSearchResult
type PartialPairingDecisionState = "PLAYED" | "SCHEDULED / UNPLAYED" | "PARTIAL / INCOMPLETE" | "UNKNOWN / NEEDS LATER REVIEW"
type PartialPairingDecision = { state: PartialPairingDecisionState; savedAt: string }

const PRO_REVIEW_DRAFT_SCHEMA = "historical-pro-review-v3-classified-pairings"

function pairingKey(pairing: HistoricalProSeasonPairing) {
  return [pairing.seasonNumber, pairing.division, pairing.gameNumber, pairing.playerAExactName, pairing.playerBExactName, pairing.playerASourceRow, pairing.playerBSourceRow, pairing.playerASourceCells, pairing.playerBSourceCells, pairing.sourceWorkbook, pairing.sourceTab, pairing.sourceRange].join("|")
}

function sourceRowsForPairing(rows: HistoricalProSourceRow[], pairing: HistoricalProSeasonPairing, name: string) {
  return rows.filter((row) => row.periodType === "season" && row.periodNumber === pairing.seasonNumber && row.division === pairing.division && row.gameNumber === pairing.gameNumber && row.historicalPlayerName === name)
}

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
  const [pairingDecisions, setPairingDecisions] = useState<Record<string, PartialPairingDecision>>({})
  const [pairingDrafts, setPairingDrafts] = useState<Record<string, PartialPairingDecisionState>>({})
  const [pairingNeedsOnly, setPairingNeedsOnly] = useState(false)
  const [pairingIndex, setPairingIndex] = useState(0)
  const [pairingNotice, setPairingNotice] = useState("")

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
        if (!cancelled) {
          setPreview(body.preview)
          setReviews(body.identityReviews)
          try {
            const saved = JSON.parse(localStorage.getItem(`historical-pro-review:${body.preview.sourceSha256 ?? "unknown"}`) ?? "null") as { schema?: string; parserVersion?: string; sourceSha256?: string | null; pairingDecisions?: Record<string, PartialPairingDecision> } | null
            const currentPartialPairingKeys = new Set(body.preview.seasonPairings.filter((pairing) => pairing.evidenceType === "SOURCE COLOR CONFIRMED" && pairing.gameState === "PARTIAL / INCOMPLETE").map(pairingKey))
            const currentPairingDecisions = Object.fromEntries(Object.entries(saved?.pairingDecisions ?? {}).filter(([key, decision]) => currentPartialPairingKeys.has(key) && Boolean(decision?.state) && Boolean(decision?.savedAt)))
            if (saved?.schema === PRO_REVIEW_DRAFT_SCHEMA && saved.parserVersion === body.preview.parserVersion && body.preview.parserVersion === HISTORICAL_PRO_PARSER_VERSION && saved.sourceSha256 === body.preview.sourceSha256) {
              setPairingDecisions(currentPairingDecisions)
              setPairingDrafts(Object.fromEntries(Object.entries(currentPairingDecisions).map(([key, decision]) => [key, decision.state])))
            }
          } catch {
            // A malformed local draft must not prevent the protected preview from loading.
          }
          setLoading(false)
        }
      } catch (loadError) {
        if (!cancelled) { setError(loadError instanceof Error ? loadError.message : "Historical Pro preview could not be loaded."); setLoading(false) }
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!preview?.sourceSha256) return
    localStorage.setItem(`historical-pro-review:${preview.sourceSha256}`, JSON.stringify({ schema: PRO_REVIEW_DRAFT_SCHEMA, parserVersion: preview.parserVersion, sourceSha256: preview.sourceSha256, pairingDecisions, exportedAt: new Date().toISOString() }))
  }, [pairingDecisions, preview])

  const effectiveReviews = useMemo(() => reviews.map((review) => {
    const decision = decisions[review.historicalPlayerName]
    return decision ? { ...review, status: "resolved" as const, canonicalPlayerId: decision.id, canonicalPlayerName: decision.screen_name, matchedSource: "manual review", confidence: 100 } : review
  }), [decisions, reviews])
  const blockers = preview ? historicalProSeasonIdentityBlockers(preview, effectiveReviews) : []
  const readyRows = preview ? historicalProSeasonReadyRows(preview, effectiveReviews) : []
  const identityRows = [...effectiveReviews].sort((left, right) => Number(left.status === "resolved") - Number(right.status === "resolved") || left.historicalPlayerName.localeCompare(right.historicalPlayerName))
  const visibleRows = showAllRows ? preview?.seasonRows ?? [] : (preview?.seasonRows ?? []).slice(0, 120)
  const actualPairings = (preview?.seasonPairings ?? []).filter((pairing) => !pairing.isBye)
  const partialPairings = actualPairings.filter((pairing) => pairing.evidenceType === "SOURCE COLOR CONFIRMED" && pairing.gameState === "PARTIAL / INCOMPLETE")
  const proxyPairings = actualPairings.filter((pairing) => pairing.evidenceType === "SOURCE COLOR CONFIRMED" && pairing.gameState === "PROXY ROUND — OPPONENT DID NOT PLAY")
  const unreviewedPartialPairings = partialPairings.filter((pairing) => !pairingDecisions[pairingKey(pairing)])
  const visiblePartialPairings = pairingNeedsOnly ? unreviewedPartialPairings : partialPairings
  const safePairingIndex = Math.min(pairingIndex, Math.max(visiblePartialPairings.length - 1, 0))
  const activePartialPairing = visiblePartialPairings[safePairingIndex]
  const activePlayerARow = activePartialPairing ? sourceRowsForPairing(preview?.seasonRows ?? [], activePartialPairing, activePartialPairing.playerAExactName)[0] : null
  const activePlayerBRow = activePartialPairing ? sourceRowsForPairing(preview?.seasonRows ?? [], activePartialPairing, activePartialPairing.playerBExactName)[0] : null

  function savePairingDecision(key: string) {
    const state = pairingDrafts[key]
    if (!state) return
    setPairingDecisions((current) => ({ ...current, [key]: { state, savedAt: new Date().toISOString() } }))
    setPairingNotice("Saved locally for this source. No scores were committed.")
  }

  function exportPairingDraft() {
    const sourceSha256 = preview?.sourceSha256
    if (!sourceSha256) return
    const draft = { schema: PRO_REVIEW_DRAFT_SCHEMA, parserVersion: preview?.parserVersion, sourceSha256, pairingDecisions, exportedAt: new Date().toISOString() }
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `historical-pro-partial-pairing-review-${sourceSha256}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

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

    <section className="rounded-xl border border-zinc-700 bg-zinc-900 p-5"><h2 className="text-2xl font-bold">Opponent pairing evidence</h2><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><div>Source pairing evidence rows: <strong>{preview.pairingSummary.artifactPairings}</strong></div><div>Actual games / pairings: <strong className="text-emerald-300">{preview.pairingSummary.actualPairings}</strong></div><div>BYE / no game: <strong>{preview.pairingSummary.byeNoGame}</strong></div><div>Source-color confirmed: <strong className="text-emerald-300">{preview.pairingSummary.sourceColorConfirmed}</strong></div><div>Played: <strong>{preview.pairingSummary.played}</strong></div><div>Scheduled / unplayed: <strong>{preview.pairingSummary.scheduledUnplayed}</strong></div><div>Proxy rounds: <strong className="text-cyan-300">{preview.pairingSummary.proxyRounds}</strong></div><div>True partial-score review: <strong className="text-amber-300">{preview.pairingSummary.partialScoreReview}</strong></div><div>Manual / ambiguous: <strong className="text-amber-300">{preview.pairingSummary.manualReview}</strong></div><div>Unknown: <strong>{preview.pairingSummary.unknown}</strong></div></div>{preview.pairingSummary.byeNoGame > 0 && <p className="mt-4 rounded border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-300">BYE evidence is preserved read-only as <strong>BYE — NO GAME</strong>. It is excluded from actual-game counts, unplayed totals, identity review, and manual decisions.</p>}{proxyPairings.length > 0 && <div className="mt-4 rounded border border-cyan-900 bg-cyan-950/20 p-3"><h3 className="font-bold text-cyan-200">Proxy rounds — opponent did not play</h3>{proxyPairings.map((pairing) => <div className="mt-2 text-sm" key={pairingKey(pairing)}>Season {pairing.seasonNumber} · {pairing.division} · Game {pairing.gameNumber}: <strong>{pairing.proxyWinnerExactName}</strong> WIN / <strong>{pairing.proxyLoserExactName}</strong> LOSS · source entries preserved as “{pairing.playerAScoreEntryText}” / “{pairing.playerBScoreEntryText}”</div>)}</div>}<p className="mt-4 text-sm text-zinc-400">Color evidence is never inferred from row background, scores, rank, W/L/D, or row order. A proxy round gives the completed player the source W/L result without inventing scores for the absent opponent. The Season 1–12 row-level artifact preserves exact source rows, cells, colors, states, and provenance.</p></section>

    <section className="rounded-xl border border-amber-700 bg-zinc-900 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-2xl font-bold">Review partial pairing records</h2><p className="mt-1 max-w-4xl text-sm text-zinc-400">Each of these {partialPairings.length} source-color-confirmed pairings has a true partial game state. Review the state only; exact names, scores, pairing evidence, and provenance remain unchanged.</p></div><button type="button" className="rounded border border-zinc-600 px-3 py-2 text-sm" onClick={exportPairingDraft}>Export review draft</button></div><div className="mt-4 grid gap-2 sm:grid-cols-3"><div>Reviewed: <strong className="text-emerald-300">{partialPairings.length - unreviewedPartialPairings.length} / {partialPairings.length}</strong></div><div>Remaining: <strong className="text-amber-300">{unreviewedPartialPairings.length}</strong></div><label className="flex items-center gap-2"><input type="checkbox" checked={pairingNeedsOnly} onChange={(event) => { setPairingNeedsOnly(event.target.checked); setPairingIndex(0) }} /> Needs review only</label></div>{pairingNotice && <p className="mt-3 text-sm text-emerald-300" role="status">{pairingNotice}</p>}{visiblePartialPairings.length === 0 ? <p className="mt-4 rounded border border-emerald-800 bg-emerald-950/30 p-4 text-emerald-200">{partialPairings.length === 0 ? "No true partial/incomplete pairing records require review; scheduled and proxy rounds were classified from source score-entry cells." : `All ${partialPairings.length} partial pairing records have a saved review decision. Turn off “Needs review only” to inspect them.`}</p> : <><div className="mt-4 flex flex-wrap items-center gap-2"><button type="button" className="rounded border border-zinc-600 px-3 py-2" disabled={safePairingIndex === 0} onClick={() => setPairingIndex((value) => Math.max(value - 1, 0))}>Previous</button><label className="min-w-0 flex-1"><span className="sr-only">Select partial pairing record</span><select className="w-full rounded border border-zinc-600 bg-zinc-950 p-2 text-sm" value={activePartialPairing ? pairingKey(activePartialPairing) : ""} onChange={(event) => { const nextIndex = visiblePartialPairings.findIndex((pairing) => pairingKey(pairing) === event.target.value); if (nextIndex >= 0) setPairingIndex(nextIndex) }}>{visiblePartialPairings.map((pairing, index) => <option value={pairingKey(pairing)} key={pairingKey(pairing)}>#{index + 1} · S{pairing.seasonNumber} · {pairing.division} · G{pairing.gameNumber} · {pairing.playerAExactName} vs {pairing.playerBExactName}</option>)}</select></label><button type="button" className="rounded border border-zinc-600 px-3 py-2" disabled={safePairingIndex >= visiblePartialPairings.length - 1} onClick={() => setPairingIndex((value) => Math.min(value + 1, visiblePartialPairings.length - 1))}>Next</button></div>{activePartialPairing && <article className="mt-4 rounded-lg border border-zinc-700 bg-zinc-950 p-4"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="text-xl font-bold">Season {activePartialPairing.seasonNumber} · {activePartialPairing.division} · Game {activePartialPairing.gameNumber}</h3><p className="text-sm text-zinc-400">Review item {safePairingIndex + 1} of {visiblePartialPairings.length} shown · {partialPairings.length - unreviewedPartialPairings.length} of {partialPairings.length} reviewed overall</p></div><div className="text-amber-300">{pairingDecisions[pairingKey(activePartialPairing)]?.state ?? "Needs review"}</div></div><div className="mt-4 grid gap-3 md:grid-cols-2"><div className="rounded border border-zinc-800 p-3"><strong>{activePartialPairing.playerAExactName}</strong><div className="mt-2 text-sm text-zinc-300">Easy: {activePlayerARow?.easyScore ?? "—"} · Hard: {activePlayerARow?.hardScore ?? "—"} · Combined: {activePlayerARow?.combinedTotal ?? "—"}</div><div className="mt-1 text-xs text-zinc-500">Source row/cells: {activePartialPairing.playerASourceRow} / {activePartialPairing.playerASourceCells}</div></div><div className="rounded border border-zinc-800 p-3"><strong>{activePartialPairing.playerBExactName}</strong><div className="mt-2 text-sm text-zinc-300">Easy: {activePlayerBRow?.easyScore ?? "—"} · Hard: {activePlayerBRow?.hardScore ?? "—"} · Combined: {activePlayerBRow?.combinedTotal ?? "—"}</div><div className="mt-1 text-xs text-zinc-500">Source row/cells: {activePartialPairing.playerBSourceRow} / {activePartialPairing.playerBSourceCells}</div></div></div><p className="mt-4 text-sm text-amber-200">Partial source state — review the game classification without filling any missing value. Blanks and dashes remain unplayed/unknown source text; a sourced 0 remains 0.</p><div className="mt-4 grid gap-3 md:grid-cols-2"><div className="space-y-1 text-xs text-zinc-400"><div>Score-entry text: A “{activePartialPairing.playerAScoreEntryText || "—"}” · B “{activePartialPairing.playerBScoreEntryText || "—"}”</div><div>Effective text color: {activePartialPairing.effectiveTextColor || "—"}</div><div>User-entered text color: {activePartialPairing.userEnteredTextColor || "—"}</div><div>Evidence type: {activePartialPairing.evidenceType}</div><div>Pairing source: {activePartialPairing.sourceWorkbook} · {activePartialPairing.sourceTab} · {activePartialPairing.sourceRange}</div></div><div className="space-y-2"><label className="block text-sm font-bold" htmlFor="partial-pairing-decision">Classify this source game state</label><select id="partial-pairing-decision" className="w-full rounded border border-zinc-600 bg-zinc-900 p-2" value={pairingDrafts[pairingKey(activePartialPairing)] ?? ""} onChange={(event) => setPairingDrafts((current) => ({ ...current, [pairingKey(activePartialPairing)]: event.target.value as PartialPairingDecisionState }))}><option value="">Select a decision</option><option value="PLAYED">PLAYED — preserve sourced scores</option><option value="SCHEDULED / UNPLAYED">SCHEDULED / UNPLAYED</option><option value="PARTIAL / INCOMPLETE">PARTIAL / INCOMPLETE</option><option value="UNKNOWN / NEEDS LATER REVIEW">UNKNOWN / NEEDS LATER REVIEW</option></select><button type="button" className="rounded bg-blue-700 px-3 py-2 font-bold" disabled={!pairingDrafts[pairingKey(activePartialPairing)]} onClick={() => savePairingDecision(pairingKey(activePartialPairing))}>Save reviewed decision</button></div></div><div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-zinc-500"><span>Source cells: A {activePartialPairing.playerASourceCells} · B {activePartialPairing.playerBSourceCells}</span>{activePartialPairing.sourceUrl && <a className="text-cyan-300 underline" href={activePartialPairing.sourceUrl} target="_blank" rel="noreferrer">Open source evidence</a>}<span>Provenance: {activePartialPairing.provenance}</span></div></article>}</>}</section>

    <section className="rounded-xl border border-zinc-700 bg-zinc-900 p-5"><h2 className="text-2xl font-bold">Scorecard preview</h2><div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-xs"><thead><tr className="border-b border-zinc-700 text-zinc-400">{["Period", "Division", "Exact name", "Game", "Map", "Easy", "Hard", "Total", "W/L/D", "PTS", "Published rank", "Era", "Game state", "Review state"].map((header) => <th className="p-2" key={header}>{header}</th>)}</tr></thead><tbody>{visibleRows.map((row) => <tr className="border-b border-zinc-800 align-top" key={row.sourceFingerprint}><td className="p-2">{row.periodLabel}</td><td className="p-2">{row.division}</td><td className="p-2 font-bold">{row.historicalPlayerName}</td><td className="p-2">G{row.gameNumber}</td><td className="p-2">{row.mapCourseCode ?? "—"}</td><td className="p-2">{row.easyScore ?? "—"}</td><td className="p-2">{row.hardScore ?? "—"}</td><td className="p-2">{row.combinedTotal ?? "—"}</td><td className="p-2">{row.wins ?? "—"}/{row.losses ?? "—"}/{row.draws ?? "—"}</td><td className="p-2">{row.points ?? "—"}</td><td className="p-2">{row.publishedRank ?? "—"}</td><td className="p-2">{row.sourceEra}</td><td className="p-2 font-bold">{row.gameState === "BYE / NO GAME" ? "BYE — NO GAME" : row.gameState}</td><td className={`p-2 font-bold ${statusClass(row.reviewStatus)}`}>{row.reviewStatus === "BYE / NO GAME" ? "BYE — NO GAME" : row.reviewStatus}</td></tr>)}</tbody></table></div><button type="button" className="mt-3 rounded border border-zinc-600 px-3 py-2" onClick={() => setShowAllRows((value) => !value)}>{showAllRows ? "Show first 120 rows" : `Show all ${preview.rows.length} rows`}</button></section>

    <section className="rounded-xl border border-zinc-700 bg-zinc-950 p-5"><h2 className="text-2xl font-bold">Season 1–12 identity-review readiness</h2><div className="mt-3 grid gap-2 sm:grid-cols-4"><div>Resolved score rows: <strong>{readyRows.length}</strong></div><div>Identity blockers: <strong className={blockers.length ? "text-amber-300" : "text-emerald-300"}>{blockers.length}</strong></div><div>Proxy rounds: <strong className="text-cyan-300">{preview.pairingSummary.proxyRounds}</strong></div><div>True partial reviews: <strong className="text-amber-300">{preview.pairingSummary.partialScoreReview}</strong></div></div>{blockers.length > 0 && <p className="mt-3 text-amber-200">Review every unresolved/ambiguous name attached to an eligible Season 1–12 score row before any future commit. This page does not commit scores or change identities automatically.</p>}{unreviewedPartialPairings.length > 0 && <p className="mt-3 text-amber-200">Commit remains disabled while {unreviewedPartialPairings.length} true partial pairing review(s) remain unresolved. Items marked UNKNOWN / NEEDS LATER REVIEW remain excluded from any future import payload.</p>}<button type="button" disabled className="mt-4 rounded bg-zinc-700 px-5 py-3 font-bold text-zinc-400">Commit Historical Pro scores (review-only phase)</button></section>
  </main>
}
