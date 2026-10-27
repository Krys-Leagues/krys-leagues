"use client"

import { useEffect, useMemo, useState } from "react"

import ExistingPlayerPicker from "@/app/admin/import/csv/components/ExistingPlayerPicker"
import type { GlobalPlayerDirectoryEntry } from "@/lib/identity/globalPlayerDirectory"
import { loadGlobalPlayerDirectory, normalizeGlobalPlayerSearch } from "@/lib/identity/globalPlayerDirectory"
import { rememberVerifiedPlayerAliases } from "@/lib/importer/rememberVerifiedPlayerAliases"
import { supabase } from "@/lib/supabase"
import {
  CLIMBERS_BASELINE_RESOLVED_SOURCE_NAMES,
  CLIMBERS_BASELINE_REVIEW_ROWS,
  CLIMBERS_BASELINE_SOURCE_NAME,
  CLIMBERS_BASELINE_SOURCE_PLAYERS,
  CLIMBERS_BASELINE_REVIEW_CUTOFF,
  combinedBaselinePoints,
  normalizeBaselineIdentity,
  type ClimbersBaselineReviewRow,
} from "@/lib/all-time/climbers-baseline-review"

type Selection = { id: string; screenName: string; source: "existing-verified" | "admin-confirmed" }
type ReviewState = "loading" | "ready" | "error"

function exactDirectoryMatches(sourceName: string, directory: GlobalPlayerDirectoryEntry[]) {
  const normalized = normalizeBaselineIdentity(sourceName)
  return directory.filter((player) => [player.screenName, ...player.verifiedAliases]
    .some((value) => normalizeBaselineIdentity(value) === normalized))
}

function candidateDirectoryMatches(sourceName: string, directory: GlobalPlayerDirectoryEntry[]) {
  const normalized = normalizeGlobalPlayerSearch(sourceName)
  if (!normalized) return []
  return directory
    .map((player) => {
      const values = [player.screenName, ...player.verifiedAliases]
      const score = values.reduce((best, value) => {
        const candidate = normalizeGlobalPlayerSearch(value)
        if (candidate === normalized) return 100
        if (candidate.includes(normalized) || normalized.includes(candidate)) return Math.min(best, 80)
        return best
      }, 101)
      return { player, score }
    })
    .filter(({ score }) => score <= 80)
    .sort((left, right) => right.score - left.score || left.player.screenName.localeCompare(right.player.screenName))
    .slice(0, 5)
}

function rowId(row: ClimbersBaselineReviewRow) {
  return normalizeBaselineIdentity(row.sourceName)
}

export default function LegacyBaselineIdentityReview() {
  const [directory, setDirectory] = useState<GlobalPlayerDirectoryEntry[]>([])
  const [selections, setSelections] = useState<Record<string, Selection>>({})
  const [searching, setSearching] = useState<string | null>(null)
  const [state, setState] = useState<ReviewState>("loading")
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  async function refreshDirectory() {
    setState("loading")
    setError("")
    try {
      const nextDirectory = await loadGlobalPlayerDirectory()
      setDirectory(nextDirectory)
      setSelections((current) => {
        const next = { ...current }
        for (const row of CLIMBERS_BASELINE_REVIEW_ROWS) {
          const matches = exactDirectoryMatches(row.sourceName, nextDirectory)
          if (matches.length === 1 && !next[rowId(row)]) {
            next[rowId(row)] = { id: matches[0].id, screenName: matches[0].screenName, source: "existing-verified" }
          }
        }
        return next
      })
      setState("ready")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Global Player identity data could not be loaded.")
      setState("error")
    }
  }

  useEffect(() => {
    // The admin layout protects this route; this read refreshes from the shared
    // server-backed identity directory and never uses browser storage.
    const timer = window.setTimeout(() => void refreshDirectory(), 0)
    return () => window.clearTimeout(timer)
  }, [])

  const statusRows = useMemo(() => CLIMBERS_BASELINE_REVIEW_ROWS.map((row) => ({
    row,
    selection: selections[rowId(row)] ?? null,
    exactMatches: exactDirectoryMatches(row.sourceName, directory),
    suggestions: candidateDirectoryMatches(row.sourceName, directory),
  })), [directory, selections])
  const resolvedReviewCount = statusRows.filter(({ selection }) => selection !== null).length
  const unresolvedReviewCount = statusRows.length - resolvedReviewCount
  const canonicalIds = new Set(statusRows.flatMap(({ selection }) => selection ? [selection.id] : []))

  async function confirmSelection(row: ClimbersBaselineReviewRow, player: { id: string; screen_name: string }) {
    const key = rowId(row)
    setBusy(key); setError(""); setMessage("")
    try {
      const memory = await rememberVerifiedPlayerAliases(
        [{ p_player_id: player.id, p_alias: row.sourceName }],
        async (request) => supabase.rpc("remember_verified_player_alias", request),
      )
      if (memory.conflicts.length || memory.failures.length) {
        throw new Error(memory.conflicts[0]?.message || memory.failures[0]?.message || "The identity confirmation was rejected.")
      }
      setSelections((current) => ({ ...current, [key]: { id: player.id, screenName: player.screen_name, source: "admin-confirmed" } }))
      setSearching(null)
      setMessage(`${row.sourceName} is confirmed as ${player.screen_name}. Refreshing from the server…`)
      await refreshDirectory()
      setMessage(`${row.sourceName} is saved in the shared verified identity system.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The identity confirmation could not be saved.")
    } finally {
      setBusy(null)
    }
  }

  return <section className="mt-6 rounded-2xl border border-lime-800 bg-lime-950/20 p-5" data-testid="climbers-baseline-review">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-lime-300">Protected identity review</p>
        <h2 className="mt-2 text-2xl font-bold">Climbers baseline · {unresolvedReviewCount} names still need review</h2>
        <p className="mt-2 max-w-3xl text-sm text-zinc-300">Confirm only an existing Global Player when the evidence is clear. Source names and point values remain unchanged; the baseline SQL stays gated until all 79 source names are resolved.</p>
      </div>
      <div className="rounded-lg border border-lime-700 bg-black/30 px-4 py-3 text-sm">
        <div>Source names: <strong>{CLIMBERS_BASELINE_SOURCE_PLAYERS}</strong></div>
        <div>Resolved: <strong>{CLIMBERS_BASELINE_RESOLVED_SOURCE_NAMES + resolvedReviewCount}</strong> / {CLIMBERS_BASELINE_SOURCE_PLAYERS}</div>
        <div>Canonical players in this queue: <strong>{canonicalIds.size}</strong></div>
        <div>Cutoff: <strong>{CLIMBERS_BASELINE_REVIEW_CUTOFF}</strong></div>
      </div>
    </div>
    <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-400">Workbook: {CLIMBERS_BASELINE_SOURCE_NAME} · July YTD + period through 14 August · existing source rows are not imported or awarded again.</div>
    {state === "loading" && <p className="mt-4 text-zinc-300">Loading verified Global Player mappings…</p>}
    {state === "error" && <p role="alert" className="mt-4 text-red-300">{error}</p>}
    {state === "ready" && <div className="mt-4 space-y-3">{statusRows.map(({ row, selection, exactMatches, suggestions }) => {
      const key = rowId(row)
      return <article key={key} className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-4" data-testid={`climbers-review-${key}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-bold text-white">{row.sourceName}</div>
            <div className="mt-1 text-sm text-zinc-400">July YTD: {row.julyYtdPoints} · Aug through 14th: {row.augustThrough14Points} · Combined: <strong className="text-lime-200">{combinedBaselinePoints(row)}</strong></div>
          </div>
          <div className={selection ? "rounded bg-emerald-950 px-3 py-1 text-sm font-bold text-emerald-300" : "rounded bg-amber-950 px-3 py-1 text-sm font-bold text-amber-300"}>{selection ? `Resolved · ${selection.source === "admin-confirmed" ? "Krys confirmed" : "existing verified mapping"}` : "Review required"}</div>
        </div>
        {selection && <div className="mt-3 rounded border border-emerald-800 bg-emerald-950/30 p-3 text-sm">Canonical player: <strong>{selection.screenName}</strong><div className="font-mono text-xs text-zinc-500">{selection.id}</div></div>}
        {!selection && <>
          {exactMatches.length > 1 && <p className="mt-3 text-sm text-amber-200">Multiple exact verified candidates exist. Do not guess; use the picker and confirm only with evidence.</p>}
          {suggestions.length > 0 && <div className="mt-3 text-sm text-zinc-300"><div className="font-semibold text-amber-200">Suggested candidates — review only</div>{suggestions.map(({ player, score }) => <div key={player.id} className="mt-1">{player.screenName} <span className="text-xs text-zinc-500">({score}% discovery match · {player.id})</span></div>)}</div>}
          <button type="button" disabled={busy === key} onClick={() => setSearching(key)} className="mt-3 rounded bg-lime-700 px-4 py-2 font-bold text-black disabled:opacity-50">{busy === key ? "Saving…" : "Search / confirm existing player"}</button>
          {searching === key && <ExistingPlayerPicker historicalDisplayName={row.sourceName} selectLabel="Save / Confirm identity" onCancel={() => setSearching(null)} onSelect={(player) => void confirmSelection(row, player)} />}
        </>}
      </article>
    })}</div>}
    {message && <p role="status" className="mt-4 text-sm text-lime-200">{message}</p>}
    {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
    {unresolvedReviewCount === 0 && state === "ready" && <div className="mt-4 rounded-lg border border-emerald-700 bg-emerald-950/40 p-4 text-emerald-200">All 17 review names now resolve through the server-backed identity directory. The baseline migration is ready for a separate review; it has not been run.</div>}
  </section>
}
