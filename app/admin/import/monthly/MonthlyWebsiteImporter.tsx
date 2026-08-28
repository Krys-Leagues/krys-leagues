"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { createBrowserSupabaseClient } from "@/lib/supabase/browser"
import { normalizeIdentity } from "@/lib/identity/normalizeIdentity"
import { monthlyIdentityBlocksCommit, retainCurrentMonthlyReviewDecisions, type MonthlyWebsiteObservation } from "@/lib/importer/adapters/monthlyWebsiteAdapter"

const supabase = createBrowserSupabaseClient()
const PARSER_VERSION = "historical-monthly-website-v2-period-gated"

type Player = { id: string; screen_name: string; active: boolean; discord_name: string | null; discord_username: string | null; discord_id: string | null; status: string | null }
type Alias = { id: string; player_id: string; alias: string; normalized_alias: string; source: string | null; verified: boolean }
type Link = { historical_player_id: string; canonical_player_id: string }
type Identity = { key: string; historicalName: string; status: "resolved" | "ambiguous" | "unresolved"; playerId: string | null; playerName: string | null; suggestedPlayerId: string | null; suggestedPlayerName: string | null; confidence: number; evidence: string }
type Payload = {
  parserVersion: string
  sourceFile: string
  sourceSha256: string
  manifest: { rawRenderedRows: number; scoreObservations: number; missingScoreObservations: number; coverage: { earliest: string; latest: string; periodCount: number; periods: string[] }; finalization: { finalizedThrough: string; activePeriodPolicy: string; currentPeriodReason: string } }
  validation: { totalRows: number; scoreRows: number; missingScoreRows: number; duplicateRows: number; conflictingRows: number; negativeScores: number; totalMismatches: number; completedTotalRows: number; completedScoreRows: number; completedMissingScoreRows: number; currentIncompleteRows: number; currentIncompleteScoreRows: number; currentIncompleteMissingScoreRows: number }
  rows: MonthlyWebsiteObservation[]
  periods: { period: string; year: number; month: number; status: "completed" | "current_incomplete"; importable: boolean; reason: string | null; rows: number; scoredRows: number; missingScoreRows: number }[]
  identityCandidates: Identity[]
  players: Player[]
  aliases: Alias[]
  links: Link[]
  existingImport: { id: string; source_sha256: string; source_row_count: number; applied_row_count: number; committed_at: string } | null
  existingScoreCount: number | null
  identityValidation: { ready: boolean; unresolvedNames: string[]; scoredRows: number }
  productionOverlap: { available: boolean; exactDuplicateRows: number; productionOnlyRows: number; crossSourceFingerprintRows: number; trueConflictRows: number }
}
type Decision = { playerId: string; playerName: string; source: "manual" }

function reviewKey(sourceSha256: string) {
  return `historical-monthly-website-review:${sourceSha256}`
}

function canonicalPlayer(playerId: string, players: Player[], links: Link[]) {
  const direct = new Map(links.map(link => [link.historical_player_id, link.canonical_player_id]))
  const visited = new Set<string>()
  let current = playerId
  while (direct.has(current) && !visited.has(current)) {
    visited.add(current)
    current = direct.get(current)!
  }
  const player = players.find(candidate => candidate.id === current)
  return player ? { playerId: player.id, playerName: player.screen_name } : null
}

function identityKey(name: string) {
  return normalizeIdentity(name)
}

export default function MonthlyWebsiteImporter() {
  const [payload, setPayload] = useState<Payload | null>(null)
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [queryByName, setQueryByName] = useState<Record<string, string>>({})
  const [needsOnly, setNeedsOnly] = useState(true)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token) throw new Error("An authenticated site-admin session is required.")
        const response = await fetch("/api/admin/monthly-website-recovery", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
        const next = await response.json() as Payload & { error?: string }
        if (!response.ok) throw new Error(next.error || "The preserved Monthly source could not be loaded.")
        let saved: Record<string, Decision> = {}
        try { saved = JSON.parse(localStorage.getItem(reviewKey(next.sourceSha256)) || "{}") as Record<string, Decision> } catch { saved = {} }
        if (!cancelled) { setPayload(next); setDecisions(retainCurrentMonthlyReviewDecisions(saved, next.identityCandidates)) }
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "The Monthly source could not be loaded.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (payload) localStorage.setItem(reviewKey(payload.sourceSha256), JSON.stringify(decisions))
  }, [decisions, payload])

  const names = useMemo(() => {
    if (!payload) return []
    const counts = new Map<string, { key: string; name: string; count: number; scored: number; missing: number; periods: string[] }>()
    for (const row of payload.rows.filter(row => row.importable)) {
      const key = identityKey(row.historicalPlayerName)
      const current = counts.get(key) ?? { key, name: row.historicalPlayerName, count: 0, scored: 0, missing: 0, periods: [] }
      current.count += 1
      if (row.score !== null) current.scored += 1
      else current.missing += 1
      if (!current.periods.includes(row.period)) current.periods.push(row.period)
      counts.set(key, current)
    }
    return [...counts.values()]
  }, [payload])

  const identityFor = (key: string) => payload?.identityCandidates.find(candidate => candidate.key === key)
  const serverEffective = (key: string): { playerId: string; playerName: string; source: "automatic" } | null => {
    const identity = identityFor(key)
    return identity?.status === "resolved" && identity.playerId && identity.playerName ? { playerId: identity.playerId, playerName: identity.playerName, source: "automatic" } : null
  }
  const needsReview = names.filter(person => !serverEffective(person.key))
  const blockingNeedsReview = needsReview.filter(person => monthlyIdentityBlocksCommit(person.scored, Boolean(serverEffective(person.key))))
  const nonBlockingNeedsReview = needsReview.filter(person => !monthlyIdentityBlocksCommit(person.scored, Boolean(serverEffective(person.key))))
  const validRows = payload?.rows.filter(row => row.importable && row.score !== null && row.issues.length === 0 && serverEffective(identityKey(row.historicalPlayerName))) ?? []
  const blockedRows = payload ? payload.validation.completedTotalRows - validRows.length : 0
  const ready = Boolean(payload && payload.identityValidation.ready && payload.validation.totalRows === payload.manifest.rawRenderedRows && payload.validation.scoreRows === payload.manifest.scoreObservations && payload.validation.missingScoreRows === payload.manifest.missingScoreObservations && payload.validation.duplicateRows === 0 && payload.validation.conflictingRows === 0 && payload.validation.totalMismatches === 0 && payload.productionOverlap.available && payload.productionOverlap.trueConflictRows === 0)
  const visibleNames = names.filter(person => !needsOnly || !serverEffective(person.key)).sort((left, right) => Number(Boolean(serverEffective(left.key))) - Number(Boolean(serverEffective(right.key))) || left.name.localeCompare(right.name))

  async function choose(key: string, playerId: string) {
    const canonical = canonicalPlayer(playerId, payload?.players ?? [], payload?.links ?? [])
    if (!canonical) { setMessage("The selected record is not a canonical Global Player."); return }
    if (!payload) return
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error("An authenticated site-admin session is required.")
      const response = await fetch("/api/admin/monthly-website-recovery/identity", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ historicalPlayerName: names.find(person => person.key === key)?.name, canonicalPlayerId: canonical.playerId }),
        cache: "no-store",
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || "The identity confirmation could not be saved.")
      setDecisions(current => ({ ...current, [key]: { ...canonical, source: "manual" } }))
      setQueryByName(current => ({ ...current, [key]: "" }))
      setMessage(`${names.find(person => person.key === key)?.name ?? key} is saved to the shared Global Player identity memory.`)
      window.location.reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The identity confirmation could not be saved.")
    }
  }

  function exportDraft() {
    if (!payload) return
    const draft = { schema: "historical-monthly-website-review-v2-period-gated", sourceSha256: payload.sourceSha256, decisions, exportedAt: new Date().toISOString() }
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }))
    const link = document.createElement("a"); link.href = url; link.download = `monthly-website-review-${payload.sourceSha256.slice(0, 12)}.json`; link.click(); URL.revokeObjectURL(url)
  }

  async function apply() {
    if (!payload || blockingNeedsReview.length || !ready || applying || !validRows.length) return
    setApplying(true); setMessage("")
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error("An authenticated site-admin session is required.")
      const rows = validRows.map(row => ({ rowKey: row.sourceFingerprint, sourceRow: row.sourceRow, year: row.year, month: row.month, periodId: row.periodId, division: row.division, historicalName: row.historicalPlayerName, canonicalPlayerId: serverEffective(identityKey(row.historicalPlayerName))!.playerId, sourcePlayerId: row.sourcePlayerId, courseName: row.courseName, difficulty: row.difficulty, score: row.score, holeInOnes: row.holeInOnes, coursePlacement: row.coursePlacement, coursePoints: row.coursePoints, overallPlacement: row.overallPlacement, coursesPlayed: row.coursesPlayed, totalStrokes: row.totalStrokes, overallHn1: row.overallHn1, overallPoints: row.overallPoints, sourceUrl: row.sourceUrl }))
      const response = await fetch("/api/admin/monthly-website-recovery/apply", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_source_filename: payload.sourceFile, p_source_sha256: payload.sourceSha256, p_parser_version: PARSER_VERSION, p_source_row_count: payload.validation.totalRows, p_rows: rows }), cache: "no-store" })
      const result = await response.json() as { data?: unknown; error?: string; correlationId?: string }
      if (!response.ok) throw new Error(`${result.error || "The Monthly database transaction rejected this source."}${result.correlationId ? ` Correlation ID: ${result.correlationId}` : ""}`)
      setMessage(`The RPC accepted ${rows.length.toLocaleString()} reviewed Monthly score observations. The ${payload.validation.missingScoreRows.toLocaleString()} missing-score rows remain blocked.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Monthly Apply request failed.")
    } finally { setApplying(false) }
  }

  if (loading) return <main className="mx-auto max-w-7xl p-6 text-white"><p>Loading preserved Monthly scores and canonical Global Players…</p></main>
  if (!payload) return <main className="mx-auto max-w-7xl p-6 text-white"><Link href="/admin/import" className="text-indigo-300">← Import Center</Link><p role="alert" className="mt-5 rounded border border-red-700 bg-red-950 p-4">{message || "The Monthly source could not be loaded."}</p></main>

  return <main className="mx-auto max-w-7xl p-6 text-white">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><Link href="/admin/import" className="text-indigo-300">← Import Center</Link><h1 className="mt-2 text-3xl font-black">Historical Monthly Website Importer</h1><p className="mt-2 text-zinc-300">Review exact Monthly website observations and link them only to existing canonical Global Players. Nothing is committed automatically.</p></div><button type="button" onClick={exportDraft} className="rounded border border-indigo-500 px-3 py-2 font-bold">Export Review Draft</button></div>
    <section className="mt-6 rounded-xl border border-zinc-700 bg-zinc-900 p-5"><h2 className="text-xl font-bold">Source validation</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Completed periods" value={payload.periods.filter(period => period.importable).length} /><Stat label="Historical rows" value={payload.validation.completedTotalRows} /><Stat label="Eligible scored" value={payload.validation.completedScoreRows} /><Stat label="Missing-score blocked" value={payload.validation.completedMissingScoreRows} /><Stat label="Exact names" value={names.length} /><Stat label="Negative scores" value={payload.validation.negativeScores} /><Stat label="Duplicate rows" value={payload.validation.duplicateRows} /><Stat label="Conflicts / totals" value={payload.validation.conflictingRows + payload.validation.totalMismatches} /></div><p className="mt-4 break-all font-mono text-xs text-zinc-500">SHA-256 {payload.sourceSha256} · {payload.manifest.coverage.earliest} through {payload.manifest.coverage.latest}</p><p className="mt-3 rounded border border-amber-700 bg-amber-950 p-3 text-amber-100"><strong>Current period blocked:</strong> {payload.manifest.finalization.currentPeriodReason} Rows after {payload.manifest.finalization.finalizedThrough} remain preserved source evidence but are not importable until explicitly finalized.</p><p className="mt-3 text-sm text-zinc-400">{payload.validation.currentIncompleteRows.toLocaleString()} current/incomplete rows excluded ({payload.validation.currentIncompleteScoreRows.toLocaleString()} scored, {payload.validation.currentIncompleteMissingScoreRows.toLocaleString()} missing-score).</p>{payload.existingImport && <p className="mt-3 rounded border border-emerald-800 bg-emerald-950 p-3 text-emerald-200">This exact source SHA already has a Monthly import record with {payload.existingImport.applied_row_count.toLocaleString()} applied observation(s); retrying is idempotent.</p>}</section>
    <section className="mt-6 rounded-xl border border-zinc-700 bg-zinc-900 p-5"><h2 className="text-xl font-bold">Production overlap preflight</h2><p className="mt-1 text-sm text-zinc-400">The protected preflight compares source fingerprints and logical observation keys without writing to Production. Same-source duplicates are safe to retry through the idempotent RPC; cross-source fingerprints and true conflicts block the action.</p>{payload.productionOverlap.available ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Same-source duplicates" value={payload.productionOverlap.exactDuplicateRows} /><Stat label="Production-only rows" value={payload.productionOverlap.productionOnlyRows} /><Stat label="Cross-source fingerprints" value={payload.productionOverlap.crossSourceFingerprintRows} /><Stat label="True conflicts" value={payload.productionOverlap.trueConflictRows} /></div> : <p className="mt-3 rounded border border-red-700 bg-red-950 p-3 text-red-200">Production overlap preflight is unavailable. Commit remains disabled until an authenticated admin preview can read the installed Monthly history.</p>}</section>
    <section className="mt-6 rounded-xl border border-zinc-700 bg-zinc-900 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Review {needsReview.length} names requiring a decision</h2><p className="mt-1 text-sm text-zinc-400">Unresolved and ambiguous names stay at the top. Only names attached to eligible scored observations block Commit.</p></div><div className="flex flex-wrap gap-2"><span className="rounded bg-amber-950 px-3 py-2 font-bold text-amber-200">NEEDS REVIEW — BLOCKING SCORED NAMES: {blockingNeedsReview.length}</span><span className="rounded bg-zinc-800 px-3 py-2 font-bold text-zinc-300">NEEDS REVIEW — NONBLOCKING / NO SCORE: {nonBlockingNeedsReview.length}</span></div></div><label className="mt-4 inline-flex items-center gap-2"><input type="checkbox" checked={needsOnly} onChange={event => setNeedsOnly(event.target.checked)} /> Needs review only</label><div className="mt-4 space-y-3">{visibleNames.map(person => { const identity = identityFor(person.key); const decision = serverEffective(person.key); const blocksCommit = monthlyIdentityBlocksCommit(person.scored, Boolean(decision)); const query = queryByName[person.key] ?? ""; const options = payload.players.filter(player => !query || [player.screen_name, ...payload.aliases.filter(alias => alias.player_id === player.id).map(alias => alias.alias)].some(value => value.toLocaleLowerCase().includes(query.toLocaleLowerCase()))).slice(0, 20); return <article key={person.key} className={`rounded-lg border p-4 ${decision ? "border-emerald-800" : "border-amber-500"}`}><div className="flex flex-wrap justify-between gap-2"><div><h3 className="text-lg font-bold">{person.name}</h3><p className="text-sm text-zinc-400">{person.periods.join(", ")} · {person.scored.toLocaleString()} scored row(s) · {person.missing.toLocaleString()} missing-score row(s) · {person.count.toLocaleString()} rendered row(s) · {identity?.status ?? "unresolved"} {identity?.evidence !== "none" ? `· ${identity?.evidence}` : ""}</p>{!decision && identity?.suggestedPlayerName && <p className="mt-1 text-sm text-cyan-200">Suggested Global Player candidate: {identity.suggestedPlayerName} (manual confirmation required)</p>}</div><span className={decision ? "text-emerald-300" : blocksCommit ? "text-amber-300" : "text-sky-300"}>{decision ? `✓ ${decision.playerName} · ${decision.source}` : blocksCommit ? "Unresolved — scored observations block Commit" : identity?.status === "ambiguous" ? "Ambiguous — no scored observations; does not block import" : "Unresolved — no scored observations; does not block import"}</span></div>{!decision && <><input value={query} onChange={event => setQueryByName(current => ({ ...current, [person.key]: event.target.value }))} placeholder="Search existing Global Players or verified aliases" className="mt-3 w-full rounded border border-zinc-600 bg-black px-3 py-2" />{query && <div className="mt-2 space-y-2">{options.map(player => <button type="button" key={player.id} onClick={() => choose(person.key, player.id)} className="block w-full rounded border border-zinc-700 p-3 text-left hover:border-indigo-400"><span className="font-bold">{player.screen_name}</span><span className="ml-2 text-xs text-zinc-400">{player.active ? "active" : "inactive/archived"}</span></button>)}{options.length === 0 && <p className="text-sm text-zinc-400">No canonical Global Player found. Do not create or guess one.</p>}</div>}</>}{decision && <button type="button" onClick={() => setDecisions(current => { const next = { ...current }; delete next[person.key]; return next })} className="mt-3 rounded border border-zinc-600 px-3 py-1">Clear manual selection</button>}</article> })}</div></section>
    <section className="mt-6 rounded-xl border border-zinc-700 bg-zinc-900 p-5"><h2 className="text-xl font-bold">Representative completed-period score observations</h2><p className="mt-1 text-sm text-zinc-400">The complete preserved CSV remains staged; current/incomplete periods are intentionally omitted from this historical preview.</p><div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-zinc-700 text-zinc-400"><th className="p-2">Year / month</th><th className="p-2">Division</th><th className="p-2">Historical name</th><th className="p-2">Course</th><th className="p-2">Difficulty</th><th className="p-2">Score</th><th className="p-2">Place</th><th className="p-2">Points</th><th className="p-2">Identity</th></tr></thead><tbody>{payload.rows.filter(row => row.importable && row.score !== null).slice(0, 150).map(row => { const match = serverEffective(identityKey(row.historicalPlayerName)); return <tr key={row.sourceFingerprint} className="border-b border-zinc-800"><td className="p-2">{row.year} / {row.month}</td><td className="p-2">{row.division}</td><td className="p-2">{row.historicalPlayerName}</td><td className="p-2">{row.courseName}</td><td className="p-2">{row.difficulty}</td><td className="p-2 font-bold">{row.score}</td><td className="p-2">{row.coursePlacement ?? "—"}</td><td className="p-2">{row.coursePoints ?? "—"}</td><td className={match ? "p-2 text-emerald-300" : "p-2 text-amber-300"}>{match?.playerName ?? identityFor(identityKey(row.historicalPlayerName))?.status ?? "unresolved"}</td></tr> })}</tbody></table></div></section>
    <section className="mt-6 rounded-xl border border-zinc-700 bg-zinc-900 p-5"><h2 className="text-xl font-bold">Commit reviewed Monthly observations</h2><p className="mt-2 text-zinc-300">Only completed-period scored rows with a canonical UUID are sent to the installed RPC. Missing-score rows and all current/incomplete period rows remain blocked and are never sent. Unresolved names with no eligible scored observations remain preserved for later review but do not block this Commit.</p><div className="mt-4 grid gap-3 sm:grid-cols-4"><Stat label="Resolved names" value={names.length - needsReview.length} /><Stat label="Blocking unresolved scored names" value={blockingNeedsReview.length} /><Stat label="Ready observations" value={validRows.length} /><Stat label="Blocked completed rows" value={blockedRows} /></div><p className="mt-3 text-sm text-amber-200">Current/incomplete rows excluded from this payload: {payload.validation.currentIncompleteRows.toLocaleString()}.</p><button type="button" disabled={Boolean(blockingNeedsReview.length || !ready || applying)} onClick={() => void apply()} className="mt-4 rounded bg-emerald-700 px-5 py-3 font-black disabled:cursor-not-allowed disabled:bg-zinc-700">{applying ? "Submitting reviewed observations…" : blockingNeedsReview.length ? `${blockingNeedsReview.length} scored name(s) still need review` : payload.productionOverlap.trueConflictRows > 0 ? "Blocked by Production conflicts" : !payload.productionOverlap.available ? "Blocked by unavailable overlap preflight" : !ready ? "Blocked by source validation" : "Commit reviewed Monthly observations"}</button></section>
    {message && <p role="status" className="mt-5 rounded border border-blue-700 bg-blue-950 p-4">{message}</p>}
  </main>
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded border border-zinc-700 bg-black p-3"><div className="text-xs uppercase text-zinc-500">{label}</div><div className="text-2xl font-black">{value.toLocaleString()}</div></div>
}
