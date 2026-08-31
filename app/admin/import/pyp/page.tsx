"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

import ExistingPlayerPicker from "@/app/admin/import/csv/components/ExistingPlayerPicker"
import type { ExistingPlayerSearchResult } from "@/lib/importer/historicalMatchIdentity"
import {
  HISTORICAL_PYP_PARSER_VERSION,
  historicalPypPreviewFingerprint,
  type HistoricalPypPairingReview,
  type HistoricalPypPreview,
  type HistoricalPypRow,
} from "@/lib/importer/adapters/historicalPypParser"
import {
  historicalPypCommitFingerprint,
  type HistoricalPypIdentityDecision,
  type HistoricalPypPairingDecision,
} from "@/lib/importer/historicalPypCommit"
import { createBrowserSupabaseClient } from "@/lib/supabase/browser"

const supabase = createBrowserSupabaseClient()
const REVIEW_STORAGE_PREFIX = "historical-pyp-review"

type IdentityReview = {
  historicalPlayerName: string
  status: "resolved" | "ambiguous" | "unresolved"
  canonicalPlayerId: string | null
  canonicalPlayerName: string | null
  candidatePlayerName: string | null
  matchedSource: string
  confidence: number
}

type IdentityDecision = {
  historicalPlayerName: string
  canonicalPlayerId: string
  canonicalPlayerName: string
  selectionSource: "manual"
}

type StoredReview = {
  parserVersion: string
  previewFingerprint: string
  identityDecisions: Record<string, IdentityDecision>
  pairingDecisions: Record<string, HistoricalPypPairingDecision>
}

type ProductionPreflight = {
  status: "READY" | "SCHEMA_NOT_INSTALLED" | "UNAVAILABLE"
  message: string | null
  sourceRowCount: number
  productionRowCount: number | null
  summary: Array<{
    classification: "EXACT DUPLICATE" | "MISSING FROM PRODUCTION" | "PRODUCTION-ONLY" | "TRUE CONFLICT"
    seasonNumber: number
    division: string
    sourceState: "PLAYED" | "UNPLAYED" | "UNKNOWN"
    identityStatus: "resolved" | "ambiguous" | "unresolved" | "unknown"
    sourceCount: number
    productionCount: number
  }>
  conflicts: Array<{
    seasonNumber: number
    division: string
    sourceState: "PLAYED" | "UNPLAYED" | "UNKNOWN"
    identityStatus: "resolved" | "ambiguous" | "unresolved" | "unknown"
    sourceFingerprint: string | null
    productionFingerprint: string | null
    conflictFields: string[]
    source: HistoricalPypRow | null
    production: Record<string, unknown> | null
  }>
}

const PREFLIGHT_CLASSIFICATIONS = ["EXACT DUPLICATE", "MISSING FROM PRODUCTION", "PRODUCTION-ONLY", "TRUE CONFLICT"] as const

function preflightSourceCount(preflight: ProductionPreflight, classification: ProductionPreflight["summary"][number]["classification"]) {
  return preflight.summary.filter((item) => item.classification === classification).reduce((total, item) => total + item.sourceCount, 0)
}

function preflightProductionCount(preflight: ProductionPreflight, classification: ProductionPreflight["summary"][number]["classification"]) {
  return preflight.summary.filter((item) => item.classification === classification).reduce((total, item) => total + item.productionCount, 0)
}

type ApiPayload = {
  preview: HistoricalPypPreview
  previewFingerprint: string
  sourceSha256: string
  expectedSourceSha256: string | null
  sourceShaMatches: boolean
  identityReviews: IdentityReview[]
  canonicalPlayerIds: string[]
  productionPreflight: ProductionPreflight
  error?: string
}

function storageKey(sourceSha256: string) {
  return `${REVIEW_STORAGE_PREFIX}:${sourceSha256}`
}

function pairingLabel(review: HistoricalPypPairingReview) {
  return `S${review.seasonNumber} · Division ${review.division} · Game ${review.gameNumber} · ${review.historicalPlayerName || "unknown source player"}`
}

function value(raw: string, parsed: number | null) {
  return parsed === null ? raw || "—" : String(parsed)
}

export default function HistoricalPypReviewPage() {
  const [payload, setPayload] = useState<ApiPayload | null>(null)
  const [identityDecisions, setIdentityDecisions] = useState<Record<string, IdentityDecision>>({})
  const [pairingDecisions, setPairingDecisions] = useState<Record<string, HistoricalPypPairingDecision>>({})
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [searching, setSearching] = useState<string | null>(null)
  const [selectedPairing, setSelectedPairing] = useState(0)
  const [seasonFilter, setSeasonFilter] = useState<number | "all">("all")
  const [divisionFilter, setDivisionFilter] = useState<string | "all">("all")
  const [needsOnly, setNeedsOnly] = useState(true)
  const [commitConfirmed, setCommitConfirmed] = useState(false)
  const [committing, setCommitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token) throw new Error("Sign in as a site admin to open Historical PYP review.")
        const response = await fetch("/api/admin/historical-pyp", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
        const next = await response.json() as ApiPayload
        if (!response.ok || !next.preview) throw new Error(next.error || "Historical PYP review could not be loaded.")
        let stored: StoredReview | null = null
        try { stored = JSON.parse(localStorage.getItem(storageKey(next.sourceSha256)) || "null") as StoredReview | null } catch { stored = null }
        const fingerprint = next.previewFingerprint || historicalPypPreviewFingerprint(next.preview)
        const saved = stored?.parserVersion === HISTORICAL_PYP_PARSER_VERSION && stored.previewFingerprint === fingerprint ? stored : null
        if (!cancelled) {
          setPayload(next)
          setIdentityDecisions(saved?.identityDecisions ?? {})
          setPairingDecisions(saved?.pairingDecisions ?? {})
        }
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Historical PYP review could not be loaded.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!payload) return
    localStorage.setItem(storageKey(payload.sourceSha256), JSON.stringify({
      parserVersion: HISTORICAL_PYP_PARSER_VERSION,
      previewFingerprint: payload.previewFingerprint,
      identityDecisions,
      pairingDecisions,
    } satisfies StoredReview))
  }, [identityDecisions, pairingDecisions, payload])

  const identityByName = useMemo(() => new Map((payload?.identityReviews ?? []).map((review) => [review.historicalPlayerName, review])), [payload])
  const effectiveIdentity = useCallback((name: string) => {
    const decision = identityDecisions[name]
    if (decision) return { id: decision.canonicalPlayerId, name: decision.canonicalPlayerName, source: "manual" }
    const automatic = identityByName.get(name)
    return automatic?.canonicalPlayerId ? { id: automatic.canonicalPlayerId, name: automatic.canonicalPlayerName || automatic.canonicalPlayerId, source: "automatic" } : null
  }, [identityByName, identityDecisions])
  const names = useMemo(() => [...new Set(payload?.preview.rows.map((row) => row.historicalPlayerName) ?? [])], [payload])
  const identityRows = useMemo(() => [...(payload?.identityReviews ?? [])].sort((left, right) => Number(Boolean(effectiveIdentity(left.historicalPlayerName))) - Number(Boolean(effectiveIdentity(right.historicalPlayerName))) || left.historicalPlayerName.localeCompare(right.historicalPlayerName)), [effectiveIdentity, payload])
  const filteredPairings = useMemo(() => (payload?.preview.pairingReviews ?? []).filter((review) => {
    if (seasonFilter !== "all" && review.seasonNumber !== seasonFilter) return false
    if (divisionFilter !== "all" && review.division !== divisionFilter) return false
    return !needsOnly || !pairingDecisions[review.reviewKey]
  }), [divisionFilter, needsOnly, pairingDecisions, payload, seasonFilter])
  const activePairingIndex = Math.min(selectedPairing, Math.max(0, filteredPairings.length - 1))
  const activeReview = filteredPairings[activePairingIndex] ?? null
  const activeRow = useMemo(() => {
    if (!activeReview || !payload) return null
    return payload.preview.rows.find((row) => row.seasonNumber === activeReview.seasonNumber && row.division === activeReview.division && row.gameNumber === activeReview.gameNumber && row.historicalPlayerName === activeReview.historicalPlayerName) ?? null
  }, [activeReview, payload])
  const resolvedCount = names.filter((name) => Boolean(effectiveIdentity(name))).length
  const ambiguousCount = names.filter((name) => !effectiveIdentity(name) && identityByName.get(name)?.status === "ambiguous").length
  const unresolvedCount = names.filter((name) => !effectiveIdentity(name) && identityByName.get(name)?.status === "unresolved").length
  const reviewedPairings = payload?.preview.pairingReviews.filter((review) => pairingDecisions[review.reviewKey]).length ?? 0
  const sourceReady = Boolean(payload?.sourceShaMatches && payload.preview.parserVersion === HISTORICAL_PYP_PARSER_VERSION)
  const canCommit = Boolean(payload && sourceReady && resolvedCount === names.length && payload.preview.pairingReviews.every((review) => pairingDecisions[review.reviewKey]?.status === "confirmed"))

  async function selectPlayer(name: string, player: ExistingPlayerSearchResult) {
    if (!payload?.canonicalPlayerIds.includes(player.id)) {
      setMessage("Select an existing canonical Global Player.")
      setSearching(null)
      return
    }
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error("Your admin session expired. Sign in again.")
      const response = await fetch("/api/admin/historical-pyp/identity", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ historicalPlayerName: name, canonicalPlayerId: player.id }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || "The identity decision could not be saved.")
      setIdentityDecisions((current) => ({ ...current, [name]: { historicalPlayerName: name, canonicalPlayerId: player.id, canonicalPlayerName: player.screen_name, selectionSource: "manual" } }))
      setMessage(`${name} is saved to the shared Global Player identity memory.`)
      setSearching(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The identity decision could not be saved.")
    }
  }

  function markPairingReviewed(review: HistoricalPypPairingReview, opponentHistoricalPlayerName: string) {
    setPairingDecisions((current) => ({ ...current, [review.reviewKey]: { reviewKey: review.reviewKey, status: "confirmed", opponentHistoricalPlayerName, opponentCanonicalPlayerId: null } }))
    setMessage(`${pairingLabel(review)} confirmed with ${opponentHistoricalPlayerName}; source evidence is unchanged.`)
  }

  async function commitPyp() {
    if (!payload || !canCommit || !commitConfirmed) return
    setCommitting(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error("Your admin session expired. Sign in again.")
      const identityPayload: Record<string, HistoricalPypIdentityDecision> = Object.fromEntries(Object.entries(identityDecisions).map(([name, decision]) => [name, { ...decision, selectionSource: "manual" as const }]))
      const fingerprint = historicalPypCommitFingerprint(payload.preview, payload.identityReviews.map((review) => ({ historicalPlayerName: review.historicalPlayerName, status: review.status, canonicalPlayerId: review.canonicalPlayerId, canonicalPlayerName: review.canonicalPlayerName })), identityPayload, pairingDecisions)
      const response = await fetch("/api/admin/historical-pyp/apply", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ sourceSha256: payload.sourceSha256, commitFingerprint: fingerprint, identityDecisions: identityPayload, pairingDecisions }) })
      const result = await response.json() as { error?: string; result?: unknown }
      if (!response.ok) throw new Error(result.error || "Historical PYP commit failed.")
      setMessage("Historical PYP commit completed.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Historical PYP commit failed.")
    } finally {
      setCommitting(false)
    }
  }

  if (loading) return <main className="mx-auto max-w-7xl p-6 text-white"><p>Loading preserved Historical PYP evidence and Global Players…</p></main>
  if (!payload) return <main className="mx-auto max-w-7xl p-6 text-white"><Link href="/admin/import" className="text-cyan-300">← Import Center</Link><p role="alert" className="mt-5 rounded border border-red-700 bg-red-950 p-4">{message}</p></main>

  return <main className="mx-auto max-w-7xl space-y-6 p-6 text-white">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><Link href="/admin/import" className="text-cyan-300">← Import Center</Link><h1 className="mt-2 text-3xl font-black">Historical PYP review</h1><p className="mt-2 max-w-4xl text-zinc-300">Protected read-only review for PYP Seasons 1–14. C1 and C2 are holes won, not golf-stroke scores. Exact names, source states, published ranks, and provenance remain unchanged.</p></div><span className="rounded border border-amber-700 bg-amber-950 px-3 py-2 text-sm text-amber-200">Review only — no PYP scores are committed</span></header>

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[["Seasons covered", "1–14"], ["Season 15", "CURRENT / EXCLUDED"], ["Exact historical names", payload.preview.audit.exactHistoricalNames], ["Participant-season/division rows", payload.preview.audit.participantSeasonDivisionRows], ["Player-game slots", payload.preview.audit.playerGameSlots], ["Played", payload.preview.audit.playedSlots], ["Unplayed", payload.preview.audit.unplayedSlots], ["Played numeric zeros", payload.preview.audit.playedZeroSlots], ["Usable matchup evidence", payload.preview.audit.usableOpponentEvidenceRecords], ["Named opponent pairings", payload.preview.audit.namedOpponentPairings], ["Actionable pairing reviews", payload.preview.audit.actionablePairingReviews], ["Unknown/nonblocking opponent rows", payload.preview.audit.unknownNonBlockingPairingRows], ["Unusable #REF! evidence", payload.preview.audit.unusableOpponentEvidenceRecords], ["Mirrored ranks resolved", payload.preview.audit.publishedPlacementConflicts]].map(([label, current]) => <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4" key={String(label)}><div className="text-sm text-zinc-400">{label}</div><div className="mt-1 text-xl font-bold">{current}</div></div>)}
    </section>

    <section className="rounded-xl border border-violet-800 bg-violet-950/20 p-5"><h2 className="text-2xl font-bold">Production read-only preflight</h2>{payload.productionPreflight.status !== "READY" ? <p className="mt-2 text-sm text-amber-200">{payload.productionPreflight.status === "SCHEMA_NOT_INSTALLED" ? "The protected historical PYP table is not installed in Production yet." : "Production comparison is unavailable from the current admin session."} {payload.productionPreflight.message || "Run the canonical SQL gate, then reload this review."}</p> : <><p className="mt-2 text-sm text-zinc-300">Source rows: {payload.productionPreflight.sourceRowCount} · Production rows: {payload.productionPreflight.productionRowCount} · No write was performed.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{PREFLIGHT_CLASSIFICATIONS.map((classification) => <div className="rounded-lg border border-violet-900 bg-zinc-950/50 p-3" key={classification}><div className="text-sm font-bold">{classification}</div><div className="mt-1 text-xs text-zinc-300">Source {preflightSourceCount(payload.productionPreflight, classification)} · Production {preflightProductionCount(payload.productionPreflight, classification)}</div></div>)}</div><div className="mt-4 space-y-1 text-sm">{payload.productionPreflight.summary.map((item) => <p key={[item.classification, item.seasonNumber, item.division, item.sourceState, item.identityStatus].join("|")}><span className="font-bold">{item.classification}</span> · S{item.seasonNumber}/D{item.division} · {item.sourceState} · identity {item.identityStatus} · source {item.sourceCount} · Production {item.productionCount}</p>)}</div>{payload.productionPreflight.conflicts.length > 0 && <div className="mt-4 rounded border border-red-700 bg-red-950/30 p-3"><h3 className="font-bold text-red-200">True conflicts</h3>{payload.productionPreflight.conflicts.map((conflict) => <details key={`${conflict.seasonNumber}-${conflict.division}-${conflict.sourceFingerprint}`} className="mt-2"><summary>S{conflict.seasonNumber}/D{conflict.division} · {conflict.sourceState} · {conflict.conflictFields.join(", ")}</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-zinc-300">{JSON.stringify({ source: conflict.source, production: conflict.production }, null, 2)}</pre></details>)}</div>}</>}</section>

    <section className="rounded-xl border border-cyan-800 bg-cyan-950/20 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-bold">Player identities</h2><p className="mt-1 text-sm text-zinc-300">Unresolved and ambiguous names appear first. Select only an existing canonical Global Player; no player is created and no score changes.</p></div><div className="flex flex-wrap gap-2 text-sm"><span className="rounded bg-emerald-950 px-3 py-2 text-emerald-200">Resolved {resolvedCount}</span><span className="rounded bg-amber-950 px-3 py-2 text-amber-200">Ambiguous {ambiguousCount}</span><span className="rounded bg-red-950 px-3 py-2 text-red-200">Unresolved {unresolvedCount}</span></div></div><div className="mt-4 space-y-3">{identityRows.map((review) => { const identity = effectiveIdentity(review.historicalPlayerName); const rowCount = payload.preview.rows.filter((row) => row.historicalPlayerName === review.historicalPlayerName).length; return <article className={`rounded-lg border p-4 ${identity ? "border-emerald-900" : "border-amber-500"}`} key={review.historicalPlayerName}><div className="flex flex-wrap justify-between gap-3"><div><h3 className="text-lg font-bold">{review.historicalPlayerName}</h3><p className="text-sm text-zinc-400">{rowCount} player-game slot(s) · source match: {review.matchedSource} {review.confidence ? `· ${review.confidence}%` : ""}</p>{review.status === "ambiguous" && review.candidatePlayerName && <p className="mt-1 text-sm text-amber-200">Candidate: {review.candidatePlayerName}</p>}</div><span className={identity ? "text-emerald-300" : review.status === "ambiguous" ? "text-amber-300" : "text-red-300"}>{identity ? `Resolved to ${identity.name} (${identity.source})` : review.status === "ambiguous" ? "AMBIGUOUS — review required" : "UNRESOLVED — review required"}</span></div>{!identity && <div className="mt-3"><button type="button" className="rounded bg-cyan-700 px-3 py-2 font-bold" onClick={() => setSearching(review.historicalPlayerName)}>Find / link existing canonical Global Player</button>{searching === review.historicalPlayerName && <ExistingPlayerPicker historicalDisplayName={review.historicalPlayerName} selectLabel="Save canonical review decision" onCancel={() => setSearching(null)} onSelect={(player) => selectPlayer(review.historicalPlayerName, player)} />}</div>}{identityDecisions[review.historicalPlayerName] && <button type="button" className="mt-3 rounded border border-zinc-600 px-3 py-1 text-sm" onClick={() => setIdentityDecisions((current) => { const next = { ...current }; delete next[review.historicalPlayerName]; return next })}>Clear local decision</button>}</article>})}</div></section>

     <section className="rounded-xl border border-zinc-700 bg-zinc-900 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-bold">Game / pairing review</h2><p className="mt-1 text-sm text-zinc-300">Only genuinely ambiguous candidate pairings appear here. Unknown or unusable opponent evidence is preserved and does not block import.</p></div><div className="text-sm text-amber-200">Reviewed {reviewedPairings} / {payload.preview.pairingReviews.length}</div></div><div className="mt-4 flex flex-wrap items-end gap-3"><label className="text-sm">Season<select className="ml-2 rounded border border-zinc-600 bg-zinc-950 p-2" value={seasonFilter} onChange={(event) => { setSeasonFilter(event.target.value === "all" ? "all" : Number(event.target.value)); setSelectedPairing(0) }}><option value="all">All Seasons 1–14</option>{payload.preview.historicalSeasons.map((season) => <option value={season} key={season}>Season {season}</option>)}</select></label><label className="text-sm">Division<select className="ml-2 rounded border border-zinc-600 bg-zinc-950 p-2" value={divisionFilter} onChange={(event) => { setDivisionFilter(event.target.value); setSelectedPairing(0) }}><option value="all">All divisions</option>{[...new Set(payload.preview.rows.map((row) => row.division))].sort().map((division) => <option value={division} key={division}>Division {division}</option>)}</select></label><label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={needsOnly} onChange={(event) => { setNeedsOnly(event.target.checked); setSelectedPairing(0) }} /> Needs Review only</label></div>{filteredPairings.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" disabled={selectedPairing === 0} className="rounded border border-zinc-600 px-3 py-2 disabled:opacity-40" onClick={() => setSelectedPairing((current) => Math.max(0, current - 1))}>Previous</button><label className="min-w-[18rem] flex-1 text-sm"><span className="sr-only">Select PYP pairing review</span><select className="w-full rounded border border-zinc-600 bg-zinc-950 p-2" value={activeReview?.reviewKey ?? ""} onChange={(event) => setSelectedPairing(filteredPairings.findIndex((review) => review.reviewKey === event.target.value))}>{filteredPairings.map((review, index) => <option value={review.reviewKey} key={review.reviewKey}>#{index + 1} · {pairingLabel(review)}</option>)}</select></label><button type="button" disabled={selectedPairing >= filteredPairings.length - 1} className="rounded border border-zinc-600 px-3 py-2 disabled:opacity-40" onClick={() => setSelectedPairing((current) => Math.min(filteredPairings.length - 1, current + 1))}>Next</button></div>}{activeReview && <PairingCard review={activeReview} row={activeRow} reviewed={Boolean(pairingDecisions[activeReview.reviewKey])} onReview={(opponent) => markPairingReviewed(activeReview, opponent)} onClear={() => setPairingDecisions((current) => { const next = { ...current }; delete next[activeReview.reviewKey]; return next })} />}{filteredPairings.length === 0 && <p className="mt-4 rounded border border-emerald-800 bg-emerald-950/30 p-3 text-emerald-200">No actionable ambiguous pairing questions match these filters. Unknown and source-proven unplayed records require no action.</p>}{message && <p role="status" className="mt-4 rounded border border-cyan-800 bg-cyan-950/30 p-3 text-cyan-100">{message}</p>}</section>

     <section className="rounded-xl border border-zinc-700 bg-zinc-950 p-5"><h2 className="text-2xl font-bold">Review safeguards and final import readiness</h2><div className="mt-3 space-y-2 text-sm text-zinc-300"><p>Normalized source SHA: <span className="break-all font-mono text-xs">{payload.sourceSha256}</span></p><p>Manifest SHA: <span className="break-all font-mono text-xs">{payload.expectedSourceSha256 ?? "not recorded"}</span> · {payload.sourceShaMatches ? "MATCH" : "MISMATCH — review blocked until refreshed"}</p><p>Parser: {HISTORICAL_PYP_PARSER_VERSION}</p><p>Unknown or unusable opponent evidence is preserved and nonblocking. Only an actually ambiguous candidate set blocks final readiness.</p><p>37 numeric 0/0 cases remain UNPLAYED. The source-proven played zeros for YODA (S10/D1/G3) and AUDREY (S11/D3/G2) remain numeric 0. Season 15 is evidence-only and excluded.</p><p>Identity readiness: {resolvedCount} / {names.length} · Actionable pairing reviews: {reviewedPairings} / {payload.preview.pairingReviews.length}</p></div><label className="mt-4 flex items-start gap-2 text-sm text-zinc-200"><input type="checkbox" checked={commitConfirmed} onChange={(event) => setCommitConfirmed(event.target.checked)} disabled={!canCommit || committing} /><span>I explicitly confirm this reviewed PYP preview is ready for the final import transaction.</span></label><button type="button" disabled={!canCommit || !commitConfirmed || committing} onClick={() => void commitPyp()} className="mt-4 rounded bg-emerald-700 px-4 py-2 font-bold disabled:cursor-not-allowed disabled:bg-zinc-700">{committing ? "Committing…" : "Commit Historical PYP"}</button></section>
  </main>
}

function PairingCard({ review, row, reviewed, onReview, onClear }: { review: HistoricalPypPairingReview; row: HistoricalPypRow | null; reviewed: boolean; onReview: (opponentHistoricalPlayerName: string) => void; onClear: () => void }) {
  return <article className="mt-4 rounded-lg border border-amber-700 bg-amber-950/20 p-4"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="text-xl font-bold">{pairingLabel(review)}</h3><p className="mt-1 text-amber-200">{review.pairingEvidence}</p></div><span className={reviewed ? "text-emerald-300" : "text-amber-300"}>{reviewed ? "REVIEWED — OPPONENT CONFIRMED" : "NEEDS REVIEW"}</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div><div className="text-xs uppercase text-zinc-500">Player</div><div className="font-bold">{row?.historicalPlayerName ?? review.historicalPlayerName ?? "Unknown source player"}</div></div><div><div className="text-xs uppercase text-zinc-500">Opponent candidates</div><div>{review.candidateOpponentHistoricalPlayerNames.join(" · ") || "UNKNOWN — not invented"}</div></div><div><div className="text-xs uppercase text-zinc-500">State</div><div>{row?.sourceState ?? "—"}</div></div><div><div className="text-xs uppercase text-zinc-500">Published placement</div><div>{row?.publishedPlacement ?? "—"}</div></div></div>{row && <div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-zinc-700 text-zinc-400"><th className="p-2">C1 holes won</th><th className="p-2">C2 holes won</th><th className="p-2">Total holes won</th><th className="p-2">W/L/D</th><th className="p-2">Points</th><th className="p-2">Source</th></tr></thead><tbody><tr><td className="p-2">{value(row.course1Raw, row.course1HolesWon)}</td><td className="p-2">{value(row.course2Raw, row.course2HolesWon)}</td><td className="p-2">{value(row.totalRaw, row.totalHolesWon)}</td><td className="p-2">{row.wins ?? "—"}/{row.losses ?? "—"}/{row.draws ?? "—"}</td><td className="p-2">{row.points ?? "—"}</td><td className="p-2"><div>{row.sourceWorkbook} · {row.sourceTab} · row {row.sourceRow}</div><div className="text-zinc-500">{row.sourceCells} · {row.sourceUrl}</div></td></tr></tbody></table></div>}<p className="mt-4 text-sm text-zinc-300">Choose only one source-supported candidate. This decision changes the review payload, not the score, rank, or preserved evidence.</p><div className="mt-4 flex flex-wrap gap-3">{reviewed ? <button type="button" className="rounded border border-zinc-600 px-3 py-2" onClick={onClear}>Clear review decision</button> : review.candidateOpponentHistoricalPlayerNames.map((candidate) => <button type="button" className="rounded bg-cyan-700 px-3 py-2 font-bold" key={candidate} onClick={() => onReview(candidate)}>Confirm {candidate}</button>)}</div></article>
}
