"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import ExistingPlayerPicker from "@/app/admin/import/csv/components/ExistingPlayerPicker"
import type { ExistingPlayerSearchResult } from "@/lib/importer/historicalMatchIdentity"
import type { HistoricalStrokeV2IdentityDecision } from "@/lib/importer/historicalStrokeV2Commit"
import type { HistoricalStrokeV2Preview } from "@/lib/importer/adapters/historicalStrokeV2"
import { createBrowserSupabaseClient } from "@/lib/supabase/browser"

const supabase = createBrowserSupabaseClient()
const REVIEW_KEY = "historical-stroke-v2-identity-review"

type IdentityReview = {
  historicalPlayerName: string
  status: "resolved" | "ambiguous" | "unresolved"
  canonicalPlayerId: string | null
  canonicalPlayerName: string | null
  candidatePlayerId: string | null
  candidatePlayerName: string | null
  matchedSource: string
  confidence: number
}

type ApiPayload = {
  preview: HistoricalStrokeV2Preview
  previewFingerprint: string
  normalizedSourceSha256: string
  identityReviews: IdentityReview[]
  canonicalPlayerIds: string[]
  error?: string
}

type StoredReview = {
  parserVersion: string
  previewFingerprint: string
  decisions: Record<string, HistoricalStrokeV2IdentityDecision>
}

function reviewStorageKey(sourceSha256: string) {
  return `${REVIEW_KEY}:${sourceSha256}`
}

export default function HistoricalStrokeV2ReviewPage() {
  const [payload, setPayload] = useState<ApiPayload | null>(null)
  const [decisions, setDecisions] = useState<Record<string, HistoricalStrokeV2IdentityDecision>>({})
  const [searching, setSearching] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [needsOnly, setNeedsOnly] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token) throw new Error("Sign in as a site admin to open Historical Stroke V2 review.")
        const response = await fetch("/api/admin/historical-stroke-v2", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
        const next = await response.json() as ApiPayload
        if (!response.ok || !next.preview) throw new Error(next.error || "Historical Stroke V2 review could not be loaded.")
        let stored: StoredReview | null = null
        try { stored = JSON.parse(localStorage.getItem(reviewStorageKey(next.normalizedSourceSha256)) || "null") as StoredReview | null } catch { stored = null }
        const saved = stored?.parserVersion === next.preview.parserVersion && stored.previewFingerprint === next.previewFingerprint ? stored.decisions : {}
        if (!cancelled) { setPayload(next); setDecisions(saved) }
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Historical Stroke V2 review could not be loaded.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (payload) localStorage.setItem(reviewStorageKey(payload.normalizedSourceSha256), JSON.stringify({ parserVersion: payload.preview.parserVersion, previewFingerprint: payload.previewFingerprint, decisions }))
  }, [decisions, payload])

  const names = useMemo(() => payload?.identityReviews.map((review) => review.historicalPlayerName) ?? [], [payload])
  const reviewByName = useMemo(() => new Map(payload?.identityReviews.map((review) => [review.historicalPlayerName, review]) ?? []), [payload])
  const countsByName = useMemo(() => {
    const counts = new Map<string, { rows: number; scored: number }>()
    for (const row of payload?.preview.observations ?? []) {
      const current = counts.get(row.historicalPlayerName) ?? { rows: 0, scored: 0 }
      current.rows += 1
      if (row.importable && row.played) current.scored += 1
      counts.set(row.historicalPlayerName, current)
    }
    return counts
  }, [payload])
  const effective = (name: string) => decisions[name]?.canonicalPlayerId ? { id: decisions[name].canonicalPlayerId!, name: decisions[name].canonicalPlayerName || decisions[name].canonicalPlayerId!, source: "manual" } : reviewByName.get(name)?.canonicalPlayerId ? { id: reviewByName.get(name)!.canonicalPlayerId!, name: reviewByName.get(name)!.canonicalPlayerName || reviewByName.get(name)!.canonicalPlayerId!, source: "automatic" } : null
  const visibleNames = [...names].filter((name) => !needsOnly || !effective(name)).sort((left, right) => Number(Boolean(effective(left))) - Number(Boolean(effective(right))) || left.localeCompare(right))
  const resolvedCount = names.filter((name) => Boolean(effective(name))).length
  const ambiguousCount = names.filter((name) => !effective(name) && reviewByName.get(name)?.status === "ambiguous").length
  const unresolvedCount = names.filter((name) => !effective(name) && reviewByName.get(name)?.status === "unresolved").length
  const scoredRows = payload?.preview.observations.filter((row) => row.importable && row.played) ?? []
  const readyScoredRows = scoredRows.filter((row) => Boolean(effective(row.historicalPlayerName))).length
  const identityBlockedScoredRows = scoredRows.length - readyScoredRows

  function selectPlayer(name: string, player: ExistingPlayerSearchResult) {
    setDecisions((current) => ({ ...current, [name]: { historicalPlayerName: name, canonicalPlayerId: player.id, canonicalPlayerName: player.screen_name, resolutionNote: "Explicit site-admin review decision; source facts unchanged." } }))
    setSearching(null)
  }

  if (loading) return <main className="mx-auto max-w-7xl p-6 text-white"><p>Loading preserved Stroke V2 evidence and Global Players…</p></main>
  if (!payload) return <main className="mx-auto max-w-7xl p-6 text-white"><Link href="/admin/import" className="text-cyan-300">← Import Center</Link><p role="alert" className="mt-5 rounded border border-red-700 bg-red-950 p-4">{message}</p></main>

  return <main className="mx-auto max-w-7xl p-6 text-white">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><Link href="/admin/import" className="text-cyan-300">← Import Center</Link><h1 className="mt-2 text-3xl font-black">Historical Stroke V2 identity review</h1><p className="mt-2 max-w-4xl text-zinc-300">Protected site-admin review of the preserved Seasons 1–61 package. Exact names remain frozen, suggestions never auto-link, and saving a decision changes local review state only.</p></div><span className="rounded border border-amber-700 bg-amber-950 px-3 py-2 text-sm text-amber-200">Review only — no Stroke scores are committed</span></div>
    <section className="mt-6 rounded-xl border border-zinc-700 bg-zinc-900 p-5"><h2 className="text-xl font-bold">Package validation</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Historical periods" value={payload.preview.audit.historicalPeriods} /><Stat label="Normalized observations" value={payload.preview.audit.observations} /><Stat label="Played" value={payload.preview.audit.playedObservations} /><Stat label="Valid unplayed" value={payload.preview.audit.unplayedObservations} /><Stat label="Played numeric zero" value={payload.preview.audit.numericZeroScores} /><Stat label="Malformed blocked" value={payload.preview.audit.malformedObservations} /><Stat label="Confirmed pairings" value={payload.preview.audit.confirmedPairings} /><Stat label="Unknown opponents" value={payload.preview.audit.unknownPairings} /></div><p className="mt-4 break-all font-mono text-xs text-zinc-500">Normalized SHA-256: {payload.normalizedSourceSha256} · Preview fingerprint: {payload.previewFingerprint}</p><p className="mt-3 rounded border border-amber-700 bg-amber-950 p-3 text-sm text-amber-100">Season 62 remains current/incomplete evidence only. Season 5 malformed rows and unsupported source tokens remain blocked. Unknown opponent evidence does not block otherwise valid score observations.</p></section>
    <section className="mt-6 rounded-xl border border-cyan-800 bg-cyan-950/20 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Global Player identity review</h2><p className="mt-1 text-sm text-zinc-300">All exact historical names from completed Seasons 1–61 are included. Unresolved and ambiguous names appear first; only existing canonical Global Players may be selected.</p></div><div className="flex flex-wrap gap-2 text-sm"><span className="rounded bg-emerald-950 px-3 py-2 text-emerald-200">Resolved {resolvedCount}</span><span className="rounded bg-amber-950 px-3 py-2 text-amber-200">Ambiguous {ambiguousCount}</span><span className="rounded bg-red-950 px-3 py-2 text-red-200">Unresolved {unresolvedCount}</span></div></div><label className="mt-4 inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={needsOnly} onChange={(event) => setNeedsOnly(event.target.checked)} /> Show names needing review only</label><div className="mt-4 space-y-3">{visibleNames.map((name) => { const review = reviewByName.get(name)!; const decision = decisions[name]; const match = effective(name); const counts = countsByName.get(name) ?? { rows: 0, scored: 0 }; return <article key={name} className={`rounded-lg border p-4 ${match ? "border-emerald-900" : "border-amber-500"}`}><div className="flex flex-wrap justify-between gap-3"><div><h3 className="text-lg font-bold">{name}</h3><p className="text-sm text-zinc-400">{counts.scored} eligible scored row(s) · {counts.rows} normalized observation(s) · source match: {review.matchedSource} {review.confidence ? `· ${review.confidence}%` : ""}</p></div><span className={match ? "text-emerald-300" : review.status === "ambiguous" ? "text-amber-300" : "text-red-300"}>{match ? `Resolved to ${match.name} (${match.source})` : review.status === "ambiguous" ? `AMBIGUOUS${review.candidatePlayerName ? ` · candidate ${review.candidatePlayerName}` : ""}` : "UNRESOLVED"}</span></div>{!match && <div className="mt-3"><button type="button" className="rounded bg-cyan-700 px-3 py-2 font-bold" onClick={() => setSearching(name)}>Find / link existing canonical Global Player</button>{searching === name && <ExistingPlayerPicker historicalDisplayName={name} allowedPlayerIds={payload.canonicalPlayerIds} selectLabel="Save canonical review decision" onCancel={() => setSearching(null)} onSelect={(player) => selectPlayer(name, player)} />}</div>}{decision && <button type="button" className="mt-3 rounded border border-zinc-600 px-3 py-1 text-sm" onClick={() => setDecisions((current) => { const next = { ...current }; delete next[name]; return next })}>Clear local decision</button>}</article> })}</div></section>
    <section className="mt-6 rounded-xl border border-zinc-700 bg-zinc-900 p-5"><h2 className="text-xl font-bold">Score readiness — no commit</h2><div className="mt-4 grid gap-3 sm:grid-cols-3"><Stat label="Eligible scored rows" value={scoredRows.length} /><Stat label="Resolved scored rows" value={readyScoredRows} /><Stat label="Identity-blocked scored rows" value={identityBlockedScoredRows} /></div><p className="mt-3 text-sm text-zinc-400">This step does not import scores. Blank/dash/source-token observations, malformed rows, Season 5 malformed evidence, Season 62, and unresolved identities remain excluded from any future commit payload.</p><button type="button" disabled className="mt-4 rounded bg-zinc-700 px-4 py-2 font-bold">Commit Historical Stroke V2 (review-only phase)</button></section>
  </main>
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded border border-zinc-700 bg-black p-3"><div className="text-xs uppercase text-zinc-500">{label}</div><div className="text-2xl font-black">{value.toLocaleString()}</div></div>
}
