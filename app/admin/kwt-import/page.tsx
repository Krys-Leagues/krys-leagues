"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Papa from "papaparse"
import ExistingPlayerPicker from "@/app/admin/import/csv/components/ExistingPlayerPicker"
import { parseHistoricalKwtRows, historicalKwtNameKey, HISTORICAL_KWT_PARSER_VERSION, type HistoricalKwtScoreRow } from "@/lib/importer/adapters/kwtAdapter"
import type { ExistingPlayerSearchResult } from "@/lib/importer/historicalMatchIdentity"
import { loadPlayerAliases } from "@/lib/importer/loadPlayerAliases"
import { loadPlayerIdentityLinks, type PlayerIdentityLink } from "@/lib/importer/loadPlayerIdentityLinks"
import { loadPlayers, type PlayerRecord } from "@/lib/importer/loadPlayers"
import { matchPlayers, type PlayerMatch } from "@/lib/importer/matchPlayers"
import { createBrowserSupabaseClient } from "@/lib/supabase/browser"

const supabase = createBrowserSupabaseClient()

type SourceFile = {
  fileName: string
  sourceSha256: string
  rows: HistoricalKwtScoreRow[]
  errors: string[]
  warnings: string[]
  duplicates: number
}

type Decision = {
  playerId: string
  playerName: string
  source: "automatic" | "manual"
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

function draftKey(sources: SourceFile[]) {
  return `historical-kwt-review:${sources.map((source) => source.sourceSha256).sort().join(":")}`
}

function canonicalPlayer(playerId: string, players: PlayerRecord[], links: PlayerIdentityLink[]) {
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

export default function HistoricalKwtImportPage() {
  const [sources, setSources] = useState<SourceFile[]>([])
  const [candidates, setCandidates] = useState(new Map<string, PlayerMatch>())
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [players, setPlayers] = useState<PlayerRecord[]>([])
  const [identityLinks, setIdentityLinks] = useState<PlayerIdentityLink[]>([])
  const [searching, setSearching] = useState<string | null>(null)
  const [needsOnly, setNeedsOnly] = useState(true)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [message, setMessage] = useState("")

  const rows = useMemo(() => sources.flatMap((source) => source.rows), [sources])
  const names = useMemo(() => Array.from(
    new Map(rows.map((row) => [historicalKwtNameKey(row.historicalName), row.historicalName])).entries(),
  ).map(([key, name]) => ({
    key,
    name,
    count: rows.filter((row) => historicalKwtNameKey(row.historicalName) === key).length,
  })), [rows])
  const effective = (key: string): Decision | null => decisions[key] ?? (() => {
    const match = candidates.get(key)
    if (!match?.playerId || !match.autoLinkEligible || match.confidence !== 100) return null
    return { playerId: match.playerId, playerName: match.matchedName ?? "Global Player", source: "automatic" }
  })()
  const unresolved = names.filter((person) => !effective(person.key))
  const errors = sources.flatMap((source) => source.errors)
  const periods = new Set(rows.map((row) => `${row.season}:${row.week}`)).size
  const visibleNames = names
    .filter((person) => !needsOnly || !effective(person.key))
    .sort((left, right) => Number(Boolean(effective(left.key))) - Number(Boolean(effective(right.key))) || left.name.localeCompare(right.name))

  useEffect(() => {
    if (sources.length) localStorage.setItem(draftKey(sources), JSON.stringify(decisions))
  }, [decisions, sources])

  async function chooseFiles(files: FileList | null) {
    if (!files) return
    setLoading(true)
    setMessage("")
    try {
      const next: SourceFile[] = []
      for (const file of Array.from(files)) {
        const text = await file.text()
        const parsed = Papa.parse<Record<string, string>>(text, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (header) => header.trim(),
        })
        const result = parseHistoricalKwtRows(parsed.data, file.name)
        next.push({
          fileName: file.name,
          sourceSha256: await sha256(text),
          rows: result.rows,
          errors: [...parsed.errors.map((error) => `${file.name}: ${error.message}`), ...result.errors],
          warnings: result.warnings,
          duplicates: result.duplicateRows,
        })
      }

      const [loadedPlayers, aliases, loadedLinks] = await Promise.all([
        loadPlayers({ includeInactive: true }),
        loadPlayerAliases(),
        loadPlayerIdentityLinks(),
      ])
      const uniqueNames = Array.from(new Map(next.flatMap((source) => source.rows).map((row) => [historicalKwtNameKey(row.historicalName), row.historicalName])).entries())
      const matches = matchPlayers(uniqueNames.map(([, name]) => name), loadedPlayers, aliases, loadedLinks)
      let saved: Record<string, Decision> = {}
      try {
        saved = JSON.parse(localStorage.getItem(draftKey(next)) ?? "{}") as Record<string, Decision>
      } catch {
        saved = {}
      }
      setPlayers(loadedPlayers)
      setIdentityLinks(loadedLinks)
      setDecisions(saved)
      setSources(next)
      setCandidates(new Map(uniqueNames.map(([key], index) => [key, matches[index]])))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The KWT files could not be staged.")
    } finally {
      setLoading(false)
    }
  }

  function selectPlayer(key: string, player: ExistingPlayerSearchResult) {
    const canonical = canonicalPlayer(player.id, players, identityLinks)
    if (!canonical) {
      setMessage("The selected player is not a valid canonical Global Player.")
      return
    }
    setDecisions((current) => ({ ...current, [key]: { ...canonical, source: "manual" } }))
    setSearching(null)
  }

  async function applyAll() {
    if (errors.length || unresolved.length || !rows.length) return
    setApplying(true)
    setMessage("")
    try {
      for (const source of sources) {
        const payload = source.rows.map((row) => ({
          ...row,
          canonicalPlayerId: effective(historicalKwtNameKey(row.historicalName))!.playerId,
        }))
        const { error } = await supabase.rpc("commit_historical_kwt_preview", {
          p_source_filename: source.fileName,
          p_source_sha256: source.sourceSha256,
          p_parser_version: HISTORICAL_KWT_PARSER_VERSION,
          p_rows: payload,
        })
        if (error) throw error
      }
      setMessage(`Imported ${rows.length.toLocaleString()} historical KWT player-weeks (${(rows.length * 2).toLocaleString()} scores).`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Historical KWT Apply failed.")
    } finally {
      setApplying(false)
    }
  }

  return <main className="min-h-screen bg-black p-6 text-white"><div className="mx-auto max-w-7xl">
    <h1 className="text-3xl font-black">Historical KWT Importer</h1>
    <p className="mt-2 text-zinc-300">Review historical KWT scores, resolve every name to an existing canonical Global Player, then apply the validated source records.</p>
    <div className="mt-4 flex flex-wrap gap-3"><Link href="/admin/kwt-import/discord-season-9" className="rounded border border-indigo-500 px-4 py-2 font-bold text-indigo-200">Review Season 9 Discord evidence</Link><Link href="/admin/kwt-import/library" className="rounded border border-zinc-600 px-4 py-2 font-bold text-zinc-200">Preview KWT score-history library</Link></div>

    <section className="mt-6 rounded-xl border border-zinc-700 bg-zinc-900 p-5">
      <h2 className="text-xl font-bold">1. Stage historical score files</h2>
      <input className="mt-3" type="file" multiple accept=".csv,text/csv" onChange={(event) => void chooseFiles(event.target.files)} />
      {loading && <p className="mt-3 text-blue-300">Reading scores and loading Global Players…</p>}
      {rows.length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Stat label="Files" value={sources.length} /><Stat label="Periods" value={periods} /><Stat label="Player-weeks" value={rows.length} /><Stat label="Easy + Hard scores" value={rows.length * 2} /><Stat label="Unique names" value={names.length} /></div>}
      {sources.map((source) => <div key={source.sourceSha256} className="mt-3 rounded border border-zinc-700 p-3"><b>{source.fileName}</b> · {source.rows.length} player-weeks · {source.duplicates} exact duplicate rows skipped<div className="font-mono text-xs text-zinc-500">SHA-256 {source.sourceSha256}</div>{source.warnings.map((warning) => <p className="text-amber-300" key={warning}>{warning}</p>)}{source.errors.map((error) => <p className="text-red-300" key={error}>{error}</p>)}</div>)}
    </section>

    {rows.length > 0 && <section className="mt-6 rounded-xl border border-zinc-700 bg-zinc-900 p-5"><h2 className="text-xl font-bold">2. Review parsed scores and identities</h2><p className="mt-2 text-zinc-400">Exact verified matches may be suggested. Every other name requires a manual choice. No player is created or guessed.</p><p className="text-sm text-emerald-300">Manual identity choices are saved locally for this exact set of source SHA-256 values.</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><Stat label="Resolved names" value={names.length - unresolved.length} /><Stat label="Names needing review" value={unresolved.length} /><Stat label="Rows blocked" value={rows.filter((row) => !effective(historicalKwtNameKey(row.historicalName))).length} /></div><div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-zinc-700 text-zinc-400"><th className="p-2">Source row</th><th className="p-2">Season / week</th><th className="p-2">Historical player</th><th className="p-2">Easy</th><th className="p-2">Hard</th><th className="p-2">Total</th></tr></thead><tbody>{rows.slice(0, 100).map((row) => <tr key={`${row.rowKey}-${row.sourceRow}`} className="border-b border-zinc-800"><td className="p-2">{row.sourceRow}</td><td className="p-2">{row.season} / {row.week}</td><td className="p-2">{row.historicalName}</td><td className="p-2">{row.easyCode}: {row.easyScore}</td><td className="p-2">{row.hardCode}: {row.hardScore}</td><td className="p-2 font-bold">{row.totalScore}</td></tr>)}</tbody></table>{rows.length > 100 && <p className="mt-2 text-xs text-zinc-500">Showing the first 100 parsed rows; all rows remain part of the apply validation.</p>}</div><div className="mt-5 flex flex-wrap items-center justify-between gap-3"><label><input type="checkbox" checked={needsOnly} onChange={(event) => setNeedsOnly(event.target.checked)} /> Needs checking only</label></div><div className="mt-3 space-y-3">{visibleNames.map((person) => { const decision = effective(person.key); return <article className={`rounded-lg border p-4 ${decision ? "border-emerald-800" : "border-amber-500"}`} key={person.key}><div className="flex flex-wrap justify-between gap-2"><div><h3 className="text-lg font-bold">{person.name}</h3><p className="text-sm text-zinc-400">{person.count} player-week{person.count === 1 ? "" : "s"}</p></div><div className={decision ? "text-emerald-300" : "text-amber-300"}>{decision ? `✓ ${decision.playerName} · ${decision.source}` : "Needs Global Player"}</div></div><div className="mt-3 flex flex-wrap gap-2"><button className="rounded bg-blue-700 px-3 py-2 font-bold" onClick={() => setSearching(person.key)}>Select Global Player</button>{decisions[person.key] && <button className="rounded border border-zinc-600 px-3 py-2" onClick={() => setDecisions((current) => { const next = { ...current }; delete next[person.key]; return next })}>Use automatic match</button>}</div>{searching === person.key && <ExistingPlayerPicker historicalDisplayName={person.name} onSelect={(player) => selectPlayer(person.key, player)} onCancel={() => setSearching(null)} />}</article> })}</div></section>}

    {rows.length > 0 && <section className="mt-6 rounded-xl border border-zinc-700 bg-zinc-900 p-5"><h2 className="text-xl font-bold">3. Apply reviewed KWT scores</h2><p className="mt-2 text-zinc-300">Apply is blocked until every historical name resolves and every source row passes validation. The server transaction re-checks admin authorization, canonical identity, totals, provenance, and idempotency.</p><button disabled={Boolean(errors.length || unresolved.length || applying)} onClick={() => void applyAll()} className="mt-4 rounded bg-emerald-700 px-5 py-3 font-black disabled:cursor-not-allowed disabled:bg-zinc-700">{applying ? "Applying…" : errors.length ? `${errors.length} source error(s)` : unresolved.length ? `${unresolved.length} name(s) still need review` : "Apply reviewed historical KWT scores"}</button></section>}
    {message && <p role="status" className="mt-5 rounded border border-blue-700 bg-blue-950 p-4">{message}</p>}
  </div></main>
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded border border-zinc-700 bg-black p-3"><div className="text-xs uppercase text-zinc-500">{label}</div><div className="text-2xl font-black">{value.toLocaleString()}</div></div>
}
