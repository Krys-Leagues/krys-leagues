"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import ExistingPlayerPicker from "@/app/admin/import/csv/components/ExistingPlayerPicker"
import { loadGlobalPlayerDirectory } from "@/lib/identity/globalPlayerDirectory"
import { normalizeDiscordHistoricalName, reconcileKwtDiscordIdentities, type KwtDiscordSeason } from "@/lib/importer/adapters/kwtDiscordEvidence"
import { stageKwtDiscordEvidence } from "@/lib/importer/adapters/kwtDiscordStaging"
import { buildKwtPersonWeekReview, type KwtManualIdentityAssignment } from "@/lib/importer/adapters/kwtDiscordWeekReview"
import { buildKwtWeeklyReconciliation, emptyKwtSeasonReviewDraft, kwtFactRenderKey, kwtSeasonReviewDraftKey, parseKwtSeasonReviewDraft, type KwtExceptionDecision } from "@/lib/importer/adapters/kwtDiscordReconciliation"
import { loadExistingKwtHistoryInventory } from "@/lib/importer/loadKwtExistingHistory"

type Result = ReturnType<typeof reconcileKwtDiscordIdentities>
type Inventory = Awaited<ReturnType<typeof loadExistingKwtHistoryInventory>>
const nameKey = (value: string) => normalizeDiscordHistoricalName(value).toLocaleLowerCase()

export default function KwtDiscordIdentityReview({ season }: { season: KwtDiscordSeason }) {
  const loadDraft = () => typeof window === "undefined" ? emptyKwtSeasonReviewDraft() : parseKwtSeasonReviewDraft(localStorage.getItem(kwtSeasonReviewDraftKey(season.sourceSha256)))
  const [results, setResults] = useState<Result | null>(null)
  const [inventory, setInventory] = useState<Inventory | null>(null)
  const [assignments, setAssignments] = useState<Record<string, KwtManualIdentityAssignment[]>>(() => loadDraft().assignments)
  const [exceptionDecisions, setExceptionDecisions] = useState<Record<string, KwtExceptionDecision>>(() => loadDraft().exceptionDecisions)
  const [leftUnresolvedNames, setLeftUnresolvedNames] = useState<string[]>(() => loadDraft().leftUnresolvedNames)
  const [reviewedPeriods, setReviewedPeriods] = useState<string[]>(() => loadDraft().reviewedPeriods)
  const [activePeriod, setActivePeriod] = useState("week-1")
  const [searchingName, setSearchingName] = useState<string | null>(null)
  const [needsCheckingOnly, setNeedsCheckingOnly] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [unresolvedFactsBeforeAtNormalization, setUnresolvedFactsBeforeAtNormalization] = useState<number | null>(null)
  const [savedAt, setSavedAt] = useState(() => new Date().toLocaleString())

  const effectiveResults = useMemo(() => results?.map(result => {
    const manual = assignments[nameKey(result.historicalName)] ?? []
    const uniqueIds = [...new Set(manual.map(value => value.canonicalPlayerId))]
    if (uniqueIds.length !== 1) return result
    const selected = manual[manual.length - 1]
    return { ...result, status: "resolved" as const, canonicalPlayerId: selected.canonicalPlayerId, canonicalPlayerName: selected.canonicalPlayerName, matchSource: "Manual Global Player selection" as const, matchedValue: selected.canonicalPlayerName }
  }) ?? null, [assignments, results])
  const weeklyReview = useMemo(() => effectiveResults ? buildKwtPersonWeekReview(season, effectiveResults, assignments) : [], [assignments, effectiveResults, season])
  const staging = useMemo(() => effectiveResults ? stageKwtDiscordEvidence(season, effectiveResults, inventory?.records ?? []) : null, [effectiveResults, inventory, season])
  const reconciliation = useMemo(() => staging ? buildKwtWeeklyReconciliation(weeklyReview, staging.facts, exceptionDecisions, leftUnresolvedNames, staging.unknownFields) : [], [exceptionDecisions, leftUnresolvedNames, staging, weeklyReview])
  const selectedPeriod = reconciliation.find(period => period.periodKey === activePeriod) ?? reconciliation[0]

  useEffect(() => {
    localStorage.setItem(kwtSeasonReviewDraftKey(season.sourceSha256), JSON.stringify({ assignments, exceptionDecisions, leftUnresolvedNames, reviewedPeriods }))
  }, [assignments, exceptionDecisions, leftUnresolvedNames, reviewedPeriods, season.sourceSha256])

  async function review() {
    setLoading(true); setError("")
    try {
      const [players, existing] = await Promise.all([loadGlobalPlayerDirectory(), loadExistingKwtHistoryInventory()])
      const directory = players.map(player => ({ id: player.id, screenName: player.screenName, verifiedAliases: player.verifiedAliases, identityAliases: player.identityAliases, status: player.status, active: player.active }))
      const beforeNormalization = reconcileKwtDiscordIdentities(season, directory, { removeLeadingAt: false })
      setUnresolvedFactsBeforeAtNormalization(beforeNormalization.filter(value => value.status === "unresolved").reduce((total, value) => total + value.factCount, 0))
      setResults(reconcileKwtDiscordIdentities(season, directory))
      setInventory(existing)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Identity review failed.") }
    finally { setLoading(false) }
  }

  function selectPlayer(historicalName: string, player: { id: string; screen_name: string }) {
    setAssignments(current => ({ ...current, [nameKey(historicalName)]: [{ canonicalPlayerId: player.id, canonicalPlayerName: player.screen_name }] }))
    setLeftUnresolvedNames(current => current.filter(value => value !== nameKey(historicalName)))
    setSearchingName(null)
    setSavedAt(new Date().toLocaleString())
  }
  function clearSelection(historicalName: string) {
    setAssignments(current => { const next = { ...current }; delete next[nameKey(historicalName)]; return next })
    setSearchingName(null)
    setSavedAt(new Date().toLocaleString())
  }
  function leaveUnresolved(historicalName: string) {
    const key = nameKey(historicalName)
    setLeftUnresolvedNames(current => current.includes(key) ? current : [...current, key])
    clearSelection(historicalName)
  }
  function decideException(fingerprint: string, decision: KwtExceptionDecision) {
    setExceptionDecisions(current => ({ ...current, [fingerprint]: decision }))
    setSavedAt(new Date().toLocaleString())
  }
  function resetDraft() {
    const draft = emptyKwtSeasonReviewDraft()
    setAssignments(draft.assignments); setExceptionDecisions(draft.exceptionDecisions); setLeftUnresolvedNames(draft.leftUnresolvedNames); setReviewedPeriods(draft.reviewedPeriods)
    setSavedAt(new Date().toLocaleString())
  }
  function exportDraft() {
    const draft = { assignments, exceptionDecisions, leftUnresolvedNames, reviewedPeriods }
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }))
    const link = document.createElement("a")
    link.href = url; link.download = `kwt-season-9-review-${season.sourceSha256.slice(0, 12)}.json`; link.click()
    URL.revokeObjectURL(url)
  }

  const allNames = effectiveResults ?? []
  const periodsComplete = reviewedPeriods.filter(key => reconciliation.some(period => period.periodKey === key && period.canMarkReviewed)).length
  const readyFacts = reconciliation.reduce((total, period) => total + period.factSummary.ready, 0)
  const blockedFacts = reconciliation.reduce((total, period) => total + period.factSummary.blocked, 0)
  const allExceptionsResolved = reconciliation.every(period => period.reviewBlockers.decisionsComplete)
  const allConflictsResolved = reconciliation.every(period => period.factSummary.conflicts === 0)
  const seasonComplete = reconciliation.length === 13 && periodsComplete === 13 && allExceptionsResolved && allConflictsResolved

  return <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Season 9 person-by-week identity review</h2><p className="mt-1 text-sm text-zinc-400">Uses the Historical Match existing-player picker. A manual selection applies to every exact occurrence of that historical name across Season 9.</p></div><button type="button" onClick={() => void review()} className="rounded-lg bg-indigo-600 px-4 py-2 font-bold">Run current review</button></div>
    {loading && <p className="mt-3 text-indigo-200">Loading current players, canonical links, former names, and verified aliases…</p>}{error && <p className="mt-3 text-red-300">{error}</p>}
    {effectiveResults && staging && <>
      <section className="mt-5 rounded-lg border border-zinc-700 p-4"><div className="flex flex-wrap justify-between gap-3"><h3 className="font-bold">Overall progress</h3><div className="flex flex-wrap gap-2"><button type="button" onClick={exportDraft} className="rounded border border-indigo-500 px-3 py-1 text-sm font-bold">Export Review Draft</button><button type="button" onClick={resetDraft} className="rounded border border-red-700 px-3 py-1 text-sm">Reset local draft</button></div></div><div className="mt-3 rounded border border-emerald-800 bg-emerald-950/30 p-3 text-sm"><p className="font-bold text-emerald-200">Review draft saved locally</p><p>Last saved: {savedAt}</p><p className="break-all font-mono text-xs text-zinc-400">Source SHA: {season.sourceSha256}</p><p className="mt-1 font-bold text-amber-200">Do not press Reset local draft unless you intend to erase this review</p></div><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Periods completely reviewed", `${periodsComplete} / ${reconciliation.length}`], ["Periods needing identity work", reconciliation.length - periodsComplete], ["Total unique historical names", allNames.length], ["Unique resolved names", allNames.filter(value => value.status === "resolved").length], ["Unique missing names", allNames.filter(value => value.status === "unresolved").length], ["Unique ambiguous names", allNames.filter(value => value.status === "ambiguous").length], ["Ready facts", readyFacts], ["Blocked facts", blockedFacts], ["Unresolved facts before @ normalization", unresolvedFactsBeforeAtNormalization ?? "—"], ["Existing matches", staging.summary.existing], ["Duplicates", staging.summary.duplicates], ["Conflicts", staging.summary.conflicts]].map(([label, value]) => <div className="rounded border border-zinc-800 p-3" key={label}><p className="text-xs uppercase text-zinc-500">{label}</p><strong className="text-xl">{value}</strong></div>)}</div></section>
      <section className="mt-5 rounded-lg border border-zinc-700 p-4"><h3 className="font-bold">Season 9 completion checklist</h3><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{[["Identity review completed", reconciliation.every(period => period.reviewBlockers.identityComplete)], ...reconciliation.map(period => [`${period.label} reviewed`, reviewedPeriods.includes(period.periodKey) && period.canMarkReviewed] as [string, boolean]), ["Exceptions resolved", allExceptionsResolved], ["Conflicts resolved", allConflictsResolved], ["Unknown fields preserved", true]].map(([label, complete]) => <div className={complete ? "text-emerald-300" : "text-zinc-400"} key={String(label)}>{complete ? "✓" : "○"} {label}</div>)}</div>{seasonComplete && <p className="mt-4 rounded border border-emerald-600 bg-emerald-950/40 p-3 font-bold text-emerald-200">Season 9 reconciliation complete — ready for final import planning</p>}</section>
      <nav aria-label="Season 9 identity periods" className="mt-5 flex flex-wrap gap-2">{reconciliation.map(period => <button type="button" key={period.periodKey} onClick={() => { setActivePeriod(period.periodKey); setSearchingName(null) }} className={`rounded-lg border px-3 py-2 text-sm font-bold ${activePeriod === period.periodKey ? "border-indigo-400 bg-indigo-700" : period.summary.needsChecking ? "border-amber-700 bg-amber-950/30" : "border-zinc-700"}`}>{period.label}<span className="ml-2 rounded-full bg-black/30 px-2 py-0.5">{period.summary.needsChecking} unresolved</span>{reviewedPeriods.includes(period.periodKey) && period.canMarkReviewed && <span className="ml-2 text-emerald-200">✓</span>}</button>)}</nav>
      {selectedPeriod && <section className="mt-5 rounded-xl border border-zinc-700 bg-zinc-950 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-2xl font-bold">{selectedPeriod.label}</h3><p className="mt-1 text-sm text-zinc-400">People {selectedPeriod.summary.totalPeople} · Resolved {selectedPeriod.summary.resolved} · Missing {selectedPeriod.summary.missing} · Ambiguous {selectedPeriod.summary.ambiguous} · Ready facts {selectedPeriod.factSummary.ready} · Needs review {selectedPeriod.factSummary.needsReview} · Conflicts {selectedPeriod.factSummary.conflicts} · Unknown fields {selectedPeriod.factSummary.unknownFields} · Existing {selectedPeriod.factSummary.existing} · Duplicates {selectedPeriod.factSummary.duplicates}</p>{selectedPeriod.week === 8 && <p className="mt-1 text-sm font-semibold text-indigo-300">One Week 8 event · {selectedPeriod.sourceSectionCount} independent source sections preserved.</p>}</div><label className="flex items-center gap-2"><input type="checkbox" checked={needsCheckingOnly} onChange={event => setNeedsCheckingOnly(event.target.checked)} /> Needs Checking only</label></div>
        <div className="mt-4 space-y-4">{selectedPeriod.people.filter(person => !needsCheckingOnly || person.status !== "resolved").map(person => <article className={`rounded-lg border p-4 ${person.status === "resolved" ? "border-zinc-800" : "border-amber-700 bg-amber-950/20"}`} key={nameKey(person.historicalName)}>
          <div className="flex flex-wrap items-start justify-between gap-4"><div><h4 className="text-lg font-bold">{person.historicalName}</h4><p className="text-sm text-zinc-500">Source {person.originalSourceHandles.join(", ")}</p><p className="mt-2 text-sm">{person.factCount} facts · {person.factTypes.map(fact => `${fact.type} ×${fact.count}`).join(" · ")}</p><p className="mt-1 text-xs text-zinc-500">Source sections: {person.sourceSections.join(", ")}</p><p className={`mt-2 font-bold ${person.status === "resolved" ? "text-emerald-300" : person.status === "conflict" ? "text-red-300" : "text-amber-300"}`}>Status: {person.status === "missing" ? "Missing from Global Players" : person.status}{person.explicitlyLeftUnresolved && <> · explicitly left unresolved</>}{person.canonicalPlayerName && <> · {person.canonicalPlayerName} <span className="font-mono text-xs">{person.canonicalPlayerId}</span></>}{person.matchSource && <> · {person.matchSource}</>}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setSearchingName(person.historicalName)} className="rounded bg-blue-700 px-3 py-2 font-bold">Select Global Player</button><button type="button" onClick={() => clearSelection(person.historicalName)} className="rounded border border-zinc-600 px-3 py-2">Clear selection</button><button type="button" onClick={() => leaveUnresolved(person.historicalName)} className="rounded border border-amber-600 px-3 py-2">Leave unresolved</button><button type="button" onClick={() => void navigator.clipboard.writeText(person.historicalName)} className="rounded border border-zinc-600 px-3 py-2">Copy historical name</button><Link href="/admin/players" target="_blank" className="rounded border border-zinc-600 px-3 py-2">Open Global Players</Link></div></div>
          {searchingName === person.historicalName && <ExistingPlayerPicker historicalDisplayName={person.historicalName} selectLabel="Select Global Player" usePageScroll onCancel={() => setSearchingName(null)} onSelect={player => selectPlayer(person.historicalName, player)} />}
          <details className="mt-3 rounded border border-zinc-700 p-3"><summary className="cursor-pointer font-bold">Facts for this person · {person.facts.length}</summary><div className="mt-3 space-y-3">{person.facts.map((fact, occurrenceIndex) => <div className="rounded border border-zinc-800 p-3 text-sm" key={kwtFactRenderKey(fact, selectedPeriod.periodKey, person.historicalName, occurrenceIndex)}><div className="flex flex-wrap justify-between gap-2"><strong>{fact.description}</strong><span className={fact.status === "Ready" ? "text-emerald-300" : ["Needs review", "Conflict"].includes(fact.status) ? "text-amber-300" : "text-zinc-300"}>{fact.status}</span></div>{person.canonicalPlayerName && <p className="mt-1 text-emerald-200">Attached to: {person.canonicalPlayerName}</p>}<p className="mt-1">Source section: {fact.sourceSection}</p><p className="mt-1 whitespace-pre-wrap text-zinc-400">Source text: {fact.rawSourceText}</p>{fact.unusualReason && <p className="mt-1 font-semibold text-amber-200">{fact.unusualReason}</p>}</div>)}</div></details>
        </article>)}</div>
        {selectedPeriod.exceptions.length > 0 && <section className="mt-5 rounded-lg border border-amber-700 bg-amber-950/20 p-4"><h4 className="font-bold text-amber-200">Exceptions requiring a decision</h4><div className="mt-3 space-y-3">{selectedPeriod.exceptions.map(fact => <div className="rounded border border-amber-800 p-3" key={fact.sourceFingerprint}><strong>{fact.description} · @{fact.sourceHandle}</strong><p className="mt-1 text-sm">{fact.unusualReason ?? "Conflicting source fact requires an explicit decision."}</p><p className="mt-1 whitespace-pre-wrap text-sm text-zinc-400">{fact.rawSourceText}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => decideException(fact.sourceFingerprint, "preserve")} className="rounded bg-emerald-700 px-3 py-2">Preserve exactly as published</button><button type="button" onClick={() => decideException(fact.sourceFingerprint, "exclude")} className="rounded bg-red-800 px-3 py-2">Exclude this fact</button><button type="button" onClick={() => decideException(fact.sourceFingerprint, "unknown")} className="rounded border border-zinc-500 px-3 py-2">Mark meaning unknown</button></div>{fact.decision && <p className="mt-2 font-bold text-blue-200">Decision: {fact.decision}</p>}</div>)}</div></section>}
        {selectedPeriod.unknownFields.length > 0 && <section className="mt-5 rounded-lg border border-zinc-700 p-4"><h4 className="font-bold">Unknown information preserved</h4>{selectedPeriod.unknownFields.map(field => <p className="mt-2 text-sm text-zinc-300" key={field.field}><strong>{field.field}</strong>: Unknown preserved — source did not supply this value.</p>)}</section>}
        <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" onClick={() => setActivePeriod(selectedPeriod.periodKey)} className="rounded border border-indigo-500 px-4 py-2 font-bold">Review {selectedPeriod.label}</button><button type="button" disabled={!selectedPeriod.canMarkReviewed} onClick={() => { setReviewedPeriods(current => current.includes(selectedPeriod.periodKey) ? current : [...current, selectedPeriod.periodKey]); setSavedAt(new Date().toLocaleString()) }} className="rounded bg-emerald-700 px-4 py-2 font-bold disabled:cursor-not-allowed disabled:bg-zinc-700">Mark {selectedPeriod.label} Reviewed</button>{reviewedPeriods.includes(selectedPeriod.periodKey) && selectedPeriod.canMarkReviewed && <span className="font-bold text-emerald-300">Reviewed ✓</span>}{!selectedPeriod.reviewBlockers.identityComplete && <span className="text-amber-300">Resolve or explicitly leave each person unresolved.</span>}{!selectedPeriod.reviewBlockers.decisionsComplete && <span className="text-amber-300">Complete every required exception decision.</span>}</div>
      </section>}
      <section className="mt-5 rounded-lg border border-zinc-700 p-4"><h3 className="font-bold">Existing database inventory</h3>{inventory && Object.entries(inventory.tableCounts).map(([table, counts]) => <p className="mt-2 text-sm" key={table}><strong>{table}</strong> · {Object.entries(counts).map(([seasonNumber, count]) => `S${seasonNumber}: ${count}`).join(" · ")}</p>)}{inventory?.errors.map(item => <p className="mt-2 text-sm text-amber-300" key={item.table}>{item.table}: unavailable to authenticated read-only review ({item.message})</p>)}</section>
      <button disabled className="mt-5 cursor-not-allowed rounded-lg bg-zinc-700 px-5 py-3 font-bold text-zinc-400">Apply disabled</button>
    </>}
  </section>
}
