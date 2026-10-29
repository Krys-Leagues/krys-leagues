"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { matchPlayers, type PlayerMatch } from "@/lib/importer/matchPlayers"
import type { PlayerRecord } from "@/lib/importer/loadPlayers"
import type { PlayerIdentityLink } from "@/lib/importer/loadPlayerIdentityLinks"
import type { PlayerIdentityAlias } from "@/lib/identity"
import { historicalKwtNameKey, HISTORICAL_KWT_PARSER_VERSION, type HistoricalKwtScoreRow } from "@/lib/importer/adapters/kwtAdapter"
import { createBrowserSupabaseClient } from "@/lib/supabase/browser"

const supabase = createBrowserSupabaseClient()
const RECOVERABLE_MALFORMED = /Easy\/Hard course codes, and integer Easy\/Hard scores are required/

type RecoverySource = {
  sourceId: string
  fileName: string
  season: number
  week: number
  sourceUrl: string
  sourceSha256: string
  normalizedSha256: string
  rows: HistoricalKwtScoreRow[]
  errors: string[]
  warnings: string[]
  duplicateRows: number
}

type RecoveryPlayer = PlayerRecord & { status: string | null }
type RecoveryAlias = { id: string; player_id: string; alias: string; normalized_alias: string; source: string | null; verified: boolean }
type IdentityCandidate = { historicalName: string; status: "exact" | "ambiguous" | "missing"; candidates: Array<{ id: string; screenName: string }> }
type RecoveryPayload = {
  parserVersion: string
  sources: RecoverySource[]
  identityCandidates: IdentityCandidate[]
  players: RecoveryPlayer[]
  aliases: RecoveryAlias[]
  links: PlayerIdentityLink[]
  existingSourceShas: string[]
  existingScorecardCount: number | null
  databaseReadError: string | null
}
type Decision = { playerId: string; playerName: string; source: "automatic" | "manual" }
type ApplyFailure = Error & { correlationId?: string }

function reviewKey(sources: RecoverySource[]) {
  return `historical-kwt-website-recovery:${sources.map((source) => source.sourceSha256).sort().join(":")}`
}

function asAliases(rows: RecoveryAlias[]): PlayerIdentityAlias[] {
  return rows.map((row) => ({
    id: row.id,
    playerId: row.player_id,
    aliasName: row.alias,
    normalizedAlias: row.normalized_alias,
    source: row.source === "manual" || row.source === "import" || row.source === "discord_name" || row.source === "screen_name" || row.source === "historical_alias" ? row.source : "unknown",
    firstSeenLeague: null,
    firstSeenSeason: null,
    lastSeenLeague: null,
    lastSeenSeason: null,
    active: true,
    verified: row.verified,
  }))
}

function canonicalPlayer(playerId: string, players: RecoveryPlayer[], links: PlayerIdentityLink[]) {
  const direct = new Map(links.map((link) => [link.historicalPlayerId, link.canonicalPlayerId]))
  const visited = new Set<string>()
  let current = playerId
  while (direct.has(current) && !visited.has(current)) {
    visited.add(current)
    current = direct.get(current)!
  }
  const player = players.find((candidate) => candidate.id === current)
  return player ? { playerId: player.id, playerName: player.screen_name } : null
}

export default function KwtWebsiteRecoveryReview() {
  const [payload, setPayload] = useState<RecoveryPayload | null>(null)
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [matches, setMatches] = useState<Map<string, PlayerMatch>>(new Map())
  const [queryByName, setQueryByName] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [applyProgress, setApplyProgress] = useState<{ completed: number; total: number; rows: number } | null>(null)
  const [message, setMessage] = useState("")

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        if (!token) throw new Error("An authenticated site-admin session is required.")
        const response = await fetch("/api/admin/kwt-website-recovery", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
        const next = await response.json() as RecoveryPayload & { error?: string }
        if (!response.ok) throw new Error(next.error || "The recovered KWT source could not be loaded.")
        if (cancelled) return
        const names = Array.from(new Map(next.sources.flatMap((source) => source.rows).map((row) => [historicalKwtNameKey(row.historicalName), row.historicalName])).entries())
        const playerRows = next.players
        const playerAliases = asAliases(next.aliases)
        const nextMatches = matchPlayers(names.map(([, name]) => name), playerRows, playerAliases, next.links)
        const saved = JSON.parse(localStorage.getItem(reviewKey(next.sources)) || "{}") as Record<string, Decision>
        setPayload(next)
        setMatches(new Map(names.map(([key], index) => [key, nextMatches[index]])))
        setDecisions(saved)
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "The recovered KWT source could not be loaded.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (payload) localStorage.setItem(reviewKey(payload.sources), JSON.stringify(decisions))
  }, [decisions, payload])

  const rows = useMemo(() => payload?.sources.flatMap((source) => source.rows) ?? [], [payload])
  const names = useMemo(() => Array.from(new Map(rows.map((row) => [historicalKwtNameKey(row.historicalName), row.historicalName])).entries()).map(([key, name]) => ({ key, name, count: rows.filter((row) => historicalKwtNameKey(row.historicalName) === key).length })), [rows])
  const identityStatus = (name: string) => payload?.identityCandidates.find((candidate) => historicalKwtNameKey(candidate.historicalName) === historicalKwtNameKey(name))?.status ?? "missing"
  const effective = (key: string): Decision | null => decisions[key] ?? (() => {
    const person = names.find((candidate) => candidate.key === key)
    if (!person || identityStatus(person.name) !== "exact") return null
    const match = matches.get(key)
    if (!match?.playerId || !match.autoLinkEligible || match.confidence !== 100) return null
    return { playerId: match.playerId, playerName: match.matchedName ?? "Global Player", source: "automatic" }
  })()
  const unresolvedNames = names.filter((person) => !effective(person.key))
  const hardBlockers = payload?.sources.flatMap((source) => source.errors.filter((error) => !RECOVERABLE_MALFORMED.test(error))) ?? []
  const malformedRows = payload?.sources.reduce((sum, source) => sum + source.errors.filter((error) => RECOVERABLE_MALFORMED.test(error)).length, 0) ?? 0
  const recoveredSourceRows = rows.length + malformedRows
  const periods = new Set(rows.map((row) => `${row.season}:${row.week}`)).size
  const automaticCount = names.filter((person) => !decisions[person.key] && effective(person.key)?.source === "automatic").length
  const existingSourceCount = payload ? payload.sources.filter((source) => payload.existingSourceShas.includes(source.sourceSha256)).length : 0
  const visibleNames = unresolvedNames

  function choose(key: string, player: { id: string; screen_name: string }) {
    const canonical = canonicalPlayer(player.id, payload?.players ?? [], payload?.links ?? [])
    if (!canonical) { setMessage("The selected player is not a canonical Global Player."); return }
    setDecisions((current) => ({ ...current, [key]: { ...canonical, source: "manual" } }))
    setQueryByName((current) => ({ ...current, [key]: "" }))
  }

  function exportDraft() {
    if (!payload) return
    const draft = { schema: "historical-kwt-website-review-v1", sourceShas: payload.sources.map((source) => source.sourceSha256), decisions, exportedAt: new Date().toISOString() }
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }))
    const link = document.createElement("a"); link.href = url; link.download = `kwt-website-review-${payload.sources[0]?.sourceSha256.slice(0, 12) ?? "draft"}.json`; link.click(); URL.revokeObjectURL(url)
  }

  async function apply() {
    if (!payload || unresolvedNames.length || hardBlockers.length || !rows.length) return
    const sources = payload.sources.filter((source) => source.rows.length > 0)
    setApplying(true); setMessage(""); setApplyProgress({ completed: 0, total: sources.length, rows: 0 })
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error("An authenticated site-admin session is required.")
      let processedRows = 0
      for (const [index, source] of sources.entries()) {
        const sourceRows = source.rows.map((row) => ({ ...row, canonicalPlayerId: effective(historicalKwtNameKey(row.historicalName))!.playerId }))
        setMessage(`Applying source ${index + 1} of ${sources.length}: ${source.fileName}…`)
        const response = await fetch("/api/admin/kwt-website-recovery/apply", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ p_source_filename: source.fileName, p_source_sha256: source.sourceSha256, p_parser_version: HISTORICAL_KWT_PARSER_VERSION, p_rows: sourceRows }),
          cache: "no-store",
        })
        const result = await response.json() as { data?: unknown; error?: string; reason?: string; correlationId?: string }
        if (!response.ok) {
          const failure = new Error(result.reason || result.error || "Historical KWT Apply failed.") as ApplyFailure
          failure.correlationId = result.correlationId
          throw failure
        }
        const resultRow = Array.isArray(result.data) ? result.data[0] : result.data
        if (!resultRow) throw new Error("The KWT Apply RPC returned no result.")
        processedRows += sourceRows.length
        setApplyProgress({ completed: index + 1, total: sources.length, rows: processedRows })
      }
      setMessage(`Applied or confirmed ${processedRows.toLocaleString()} valid player-weeks across ${sources.length} source files. ${malformedRows} malformed row(s) remain blocked.`)
    } catch (error) {
      const failure = error as ApplyFailure
      setMessage(`${failure instanceof Error ? failure.message : "Historical KWT Apply failed."}${failure.correlationId ? ` Correlation ID: ${failure.correlationId}` : ""}`)
    } finally {
      setApplying(false)
    }
  }

  if (loading) return <main className="mx-auto max-w-7xl p-6 text-white"><p>Loading recovered KWT sources and canonical Global Players…</p></main>
  if (!payload) return <main className="mx-auto max-w-7xl p-6 text-white"><Link href="/admin/kwt-import" className="text-indigo-300">← Historical KWT Importer</Link><p role="alert" className="mt-5 rounded border border-red-700 bg-red-950 p-4">{message || "The recovered source could not be loaded."}</p></main>

  return <main className="mx-auto max-w-7xl p-6 text-white">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><Link href="/admin/kwt-import" className="text-indigo-300">← Historical KWT Importer</Link><h1 className="mt-2 text-3xl font-black">Recovered KWT Website Scores</h1><p className="mt-2 text-zinc-300">Review the read-only KWT website extraction. Exact historical names are preserved; only existing canonical Global Players may be selected.</p></div><button type="button" onClick={exportDraft} className="rounded border border-indigo-500 px-3 py-2 font-bold">Export Review Draft</button></div>
    <section className="mt-6 rounded-xl border border-zinc-700 bg-zinc-900 p-5"><h2 className="text-xl font-bold">Recovery and safety summary</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Stat label="Seasons" value={new Set(payload.sources.map((source) => source.season)).size} /><Stat label="Weeks" value={periods} /><Stat label="Recovered rows" value={recoveredSourceRows} /><Stat label="Valid player-weeks" value={rows.length} /><Stat label="Easy observations" value={rows.length} /><Stat label="Hard observations" value={rows.length} /><Stat label="Unique names" value={names.length} /><Stat label="Automatic exact" value={automaticCount} /><Stat label="Needs review" value={unresolvedNames.length} /><Stat label="Malformed blocked" value={malformedRows} /><Stat label="Existing source files" value={existingSourceCount} /></div><p className="mt-4 text-sm text-zinc-400">Valid source rows: {rows.length.toLocaleString()} · Blocked missing-Hard rows: {malformedRows.toLocaleString()} · Valid total observations: {rows.length.toLocaleString()} · Duplicate rows: {payload.sources.reduce((sum, source) => sum + source.duplicateRows, 0)} · Conflicting observations: {hardBlockers.length ? "blocked for review" : "0"} · Existing scorecards: {payload.existingScorecardCount === null ? "unavailable" : payload.existingScorecardCount.toLocaleString()}</p><p className="mt-2 text-xs text-zinc-500">Source SHA values are the preserved raw KWT result-page SHA-256 values. Historical rank/division remains null when the source does not supply it; current website rank is never inferred.</p>{payload.databaseReadError && <p className="mt-2 text-amber-300">Database read note: {payload.databaseReadError}</p>}</section>
    <section className="mt-6 rounded-xl border border-zinc-700 bg-zinc-900 p-5"><h2 className="text-xl font-bold">Source validation</h2><div className="mt-3 space-y-2">{payload.sources.map((source) => <div key={source.sourceSha256} className="rounded border border-zinc-700 p-3"><div className="flex flex-wrap justify-between gap-2"><b>{source.fileName}</b><span>{source.rows.length} valid row(s)</span></div><div className="break-all font-mono text-xs text-zinc-500">Raw SHA-256 {source.sourceSha256} · normalized {source.normalizedSha256}</div>{source.errors.map((error) => <p className={RECOVERABLE_MALFORMED.test(error) ? "text-amber-300" : "text-red-300"} key={error}>{error}</p>)}{source.warnings.map((warning) => <p className="text-amber-300" key={warning}>{warning}</p>)}</div>)}</div></section>
    <section className="mt-6 rounded-xl border border-zinc-700 bg-zinc-900 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Review the {unresolvedNames.length} names requiring a decision</h2><p className="mt-1 text-sm text-zinc-400">One selection applies to every occurrence of that exact historical name. Automatic exact matches remain reviewable in the exported draft but do not need manual work.</p></div><span className="rounded bg-amber-950 px-3 py-2 font-bold text-amber-200">{unresolvedNames.length} unresolved / ambiguous</span></div><div className="mt-4 space-y-3">{visibleNames.map((person) => { const key = person.key; const query = queryByName[key] ?? ""; const options = payload.players.filter((player) => !query || [player.screen_name, ...payload.aliases.filter((alias) => alias.player_id === player.id).map((alias) => alias.alias)].some((value) => value.toLocaleLowerCase().includes(query.toLocaleLowerCase()))).slice(0, 20); return <article key={key} className="rounded-lg border border-amber-500 p-4"><div className="flex flex-wrap justify-between gap-2"><div><h3 className="text-lg font-bold">{person.name}</h3><p className="text-sm text-zinc-400">{person.count} player-week{person.count === 1 ? "" : "s"} · {identityStatus(person.name) === "ambiguous" ? "ambiguous canonical candidates" : "no exact canonical candidate"}</p></div><button type="button" className="rounded border border-zinc-600 px-3 py-1" onClick={() => setDecisions((current) => { const next = { ...current }; delete next[key]; return next })}>Clear</button></div><input value={query} onChange={(event) => setQueryByName((current) => ({ ...current, [key]: event.target.value }))} placeholder="Search existing Global Players or verified aliases" className="mt-3 w-full rounded border border-zinc-600 bg-black px-3 py-2" />{query && <div className="mt-2 space-y-2">{options.map((player) => <button type="button" key={player.id} onClick={() => choose(key, player)} className="block w-full rounded border border-zinc-700 p-3 text-left hover:border-indigo-400"><span className="font-bold">{player.screen_name}</span><span className="ml-2 text-xs text-zinc-400">{player.active ? "active" : "inactive/archived"}</span></button>)}{options.length === 0 && <p className="text-sm text-zinc-400">No canonical Global Player found. Do not create or guess one.</p>}</div>}{decisions[key] && <p className="mt-2 text-emerald-300">Selected: {decisions[key].playerName} · manual · saved locally for this source SHA set</p>}</article> })}</div></section>
    <section className="mt-6 rounded-xl border border-zinc-700 bg-zinc-900 p-5"><h2 className="text-xl font-bold">Apply valid reviewed score rows</h2><p className="mt-2 text-zinc-300">The server transaction re-checks site-admin authorization, canonical identity, totals, provenance, and idempotency. The {malformedRows} missing-Hard row(s) are excluded and remain blocked; rank/division/placement are optional facts.</p><button type="button" disabled={Boolean(unresolvedNames.length || hardBlockers.length || applying)} onClick={() => void apply()} className="mt-4 rounded bg-emerald-700 px-5 py-3 font-black disabled:cursor-not-allowed disabled:bg-zinc-700">{applying ? "Applying…" : hardBlockers.length ? "Blocked by source validation" : unresolvedNames.length ? `${unresolvedNames.length} name(s) still need review` : "Apply valid historical KWT scores"}</button>{applyProgress && <p className="mt-3 text-sm text-zinc-400">Source progress: {applyProgress.completed.toLocaleString()} / {applyProgress.total.toLocaleString()} · {applyProgress.rows.toLocaleString()} valid player-weeks processed. Retrying is idempotent and resumes safely at the source-file boundary.</p>}</section>
    {message && <p role="status" className="mt-5 rounded border border-blue-700 bg-blue-950 p-4">{message}</p>}
  </main>
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded border border-zinc-700 bg-black p-3"><div className="text-xs uppercase text-zinc-500">{label}</div><div className="text-2xl font-black">{value.toLocaleString()}</div></div>
}
