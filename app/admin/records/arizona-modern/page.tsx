"use client"

import Link from "next/link"
import { FormEvent, useEffect, useMemo, useState } from "react"

import ExistingPlayerPicker from "@/app/admin/import/csv/components/ExistingPlayerPicker"
import { ALL_TIME_PAGE_SIZES, DEFAULT_ALL_TIME_PAGE_SIZE, buildReviewedPreviewRows, identityReviewComplete, paginateRows } from "@/lib/all-time/arizona/review"
import type { AllTimeCourseOption, ArizonaCsvIssue, ArizonaIdentityDecision, ArizonaPreviewRow, BestRecordSnapshot } from "@/lib/all-time/arizona/types"
import { supabase } from "@/lib/supabase"

type PreviewResponse = {
  error?: string
  courseCode: string
  csvFilename: string
  csvFileHash: string
  sourceRowsScanned: number
  issues: ArizonaCsvIssue[]
  existingBest: BestRecordSnapshot[]
  previewRows: ArizonaPreviewRow[]
}

type ImportResponse = {
  error?: string
  result?: Record<string, unknown>
  identityMemory?: { created: number; alreadyKnown: number; conflicts: unknown[]; failures: unknown[] }
}

const ACTION_LABELS: Record<string, string> = { new_record: "INITIAL BEST RECORD", better_score: "BETTER SCORE", equal_unchanged: "EQUAL / UNCHANGED", worse_score_ignored: "KEEP EXISTING BETTER SCORE", unresolved_identity: "UNRESOLVED IDENTITY", ambiguous_identity: "AMBIGUOUS IDENTITY" }

export default function ArizonaModernPilotPage() {
  const [courses, setCourses] = useState<AllTimeCourseOption[]>([])
  const [courseCode, setCourseCode] = useState("")
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [decisions, setDecisions] = useState<Record<string, ArizonaIdentityDecision>>({})
  const [searching, setSearching] = useState<string | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_ALL_TIME_PAGE_SIZE)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [importResult, setImportResult] = useState<ImportResponse | null>(null)

  useEffect(() => { void (async () => {
    try {
      const response = await fetch("/api/admin/records/all-time/preview", { headers: { Authorization: `Bearer ${await sessionToken()}` } })
      const payload = await response.json() as { courses?: AllTimeCourseOption[]; error?: string }
      if (!response.ok || payload.error) throw new Error(payload.error || "Course catalog failed.")
      setCourses(payload.courses ?? []); setCourseCode((current) => current || payload.courses?.[0]?.code || "")
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Course catalog failed.") }
  })() }, [])

  const effectiveRows = useMemo(() => buildReviewedPreviewRows(preview?.previewRows ?? [], decisions, preview?.existingBest ?? []), [decisions, preview])
  const paged = useMemo(() => paginateRows(effectiveRows, pageNumber, pageSize), [effectiveRows, pageNumber, pageSize])
  const pendingReview = (preview?.previewRows ?? []).filter((row) => !identityReviewComplete(row, decisions[row.fingerprint])).length
  const categoryCounts = effectiveRows.reduce<Record<string, number>>((counts, item) => { counts[item.category] = (counts[item.category] ?? 0) + 1; return counts }, {})
  const canImport = Boolean(preview && csvFile && preview.issues.length === 0 && preview.previewRows.length > 0 && pendingReview === 0 && !busy && !importResult)

  async function sessionToken() {
    const session = (await supabase.auth.getSession()).data.session
    if (!session) throw new Error("An authenticated site-admin session is required.")
    return session.access_token
  }

  async function buildPreview(event: FormEvent) {
    event.preventDefault()
    if (!csvFile) return setError("Choose one CSV file.")
    setBusy(true); setError(""); setPreview(null); setDecisions({}); setImportResult(null); setPageNumber(1)
    try {
      const form = new FormData(); form.set("courseCode", courseCode); form.set("csv", csvFile)
      const response = await fetch("/api/admin/records/all-time/preview", { method: "POST", headers: { Authorization: `Bearer ${await sessionToken()}` }, body: form })
      const payload = await response.json() as PreviewResponse
      if (!response.ok || payload.error) throw new Error(payload.error || "Preview failed.")
      setPreview(payload)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Preview failed.") }
    finally { setBusy(false) }
  }

  function leaveUnresolved(row: ArizonaPreviewRow) {
    setDecisions((current) => ({ ...current, [row.fingerprint]: { playerId: null, canonicalScreenName: null, selectionSource: "unresolved" } }))
    setSearching(null)
  }

  async function applyImport() {
    if (!canImport || !csvFile) return
    setBusy(true); setError(""); setConfirming(false)
    try {
      const form = new FormData(); form.set("courseCode", courseCode); form.set("csv", csvFile); form.set("decisions", JSON.stringify(decisions))
      const response = await fetch("/api/admin/records/all-time/apply", { method: "POST", headers: { Authorization: `Bearer ${await sessionToken()}` }, body: form })
      const payload = await response.json() as ImportResponse
      if (!response.ok || payload.error) throw new Error(payload.error || "Import failed.")
      setImportResult(payload)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Import failed.") }
    finally { setBusy(false) }
  }

  return <main className="min-h-screen bg-slate-950 p-6 text-white">
    <Link href="/admin/records" className="text-blue-300">← Records Admin</Link>
    <h1 className="mt-4 text-4xl font-bold">All-Time Easy/Hard Records</h1>
    <p className="mt-2 max-w-4xl text-slate-300">Import one Easy or Hard historical course CSV at a time. Preview and identity review are read-only; the protected All-Time RPC remains authoritative on final import.</p>
    <section className="mt-5 rounded-xl border border-blue-700 bg-blue-950/40 p-4 text-blue-100">CSV only. Easy and Hard remain separate. Combined records and the 104 pending legacy rows are not part of this importer.</section>

    <form onSubmit={buildPreview} className="mt-6 space-y-5 rounded-2xl border border-slate-700 bg-slate-900 p-6">
      <label className="block font-bold">1. Target course<select value={courseCode} onChange={(event) => { setCourseCode(event.target.value); setPreview(null); setImportResult(null) }} className="mt-2 block w-full rounded border border-slate-600 bg-slate-950 p-3">{courses.map((course) => <option key={course.code} value={course.code}>{course.code} — {course.displayName}</option>)}</select></label>
      <label className="block font-bold">2. Choose one CSV<input type="file" accept=".csv,text/csv" onChange={(event) => { setCsvFile(event.target.files?.[0] ?? null); setPreview(null); setImportResult(null) }} className="mt-2 block w-full rounded border border-slate-600 bg-slate-950 p-3" /></label>
      <p className="text-sm text-slate-400">Required columns: <code>historical_player_name,score</code>. Optional: <code>source_row,rank,source_workbook,source_date,notes,course_code</code>.</p>
      <button disabled={busy || !csvFile} className="rounded bg-blue-700 px-5 py-3 font-bold disabled:bg-slate-700">{busy ? "Working…" : "Preview CSV"}</button>
    </form>

    {error && <div role="alert" className="mt-5 rounded border border-red-700 bg-red-950/50 p-4 text-red-200">{error}</div>}
    {preview && <>
      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Summary label="Rows scanned" value={preview.sourceRowsScanned} /><Summary label="Needs identity review" value={pendingReview} /><Summary label="Invalid / duplicate" value={preview.issues.length} />
        {Object.entries(categoryCounts).map(([label, value]) => <Summary key={label} label={label.replaceAll("_", " ")} value={value} />)}
      </section>
      <section className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-4"><h2 className="text-xl font-bold">Source</h2><div>{preview.csvFilename} · {preview.courseCode} · {preview.previewRows.length} valid rows</div><code className="break-all text-xs text-slate-500">{preview.csvFileHash}</code>{preview.issues.map((issue, index) => <div key={`${issue.csvRow}-${index}`} className="mt-2 text-amber-200"><strong>{issue.category.replaceAll("_", " ")}</strong> · CSV row {issue.csvRow}: {issue.message}</div>)}</section>

      <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-bold">3. Review player matches</h2><label>Rows per page <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPageNumber(1) }} className="ml-2 rounded bg-slate-950 p-2">{ALL_TIME_PAGE_SIZES.map((size) => <option key={size}>{size}</option>)}</select></label></div>
        <div className="mt-4 overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="border-b border-slate-600 text-left text-slate-400"><th className="p-2">Historical source</th><th className="p-2">Score</th><th className="p-2">Identity review</th><th className="p-2">Existing best</th><th className="p-2">Action</th></tr></thead><tbody>{paged.rows.map(({ row, category, existingBestScore }) => {
          const decision = decisions[row.fingerprint]; const currentName = decision?.canonicalScreenName ?? row.identity.canonicalScreenName
          const isUnlinked = !currentName
          return <tr key={row.fingerprint} className={isUnlinked ? "border-b border-amber-500 bg-amber-950/60 align-top ring-1 ring-inset ring-amber-500/70" : "border-b border-slate-800 align-top"}><td className={isUnlinked ? "bg-amber-400 p-3 text-slate-950" : "p-2"}><strong className={isUnlinked ? "block text-base font-black" : undefined}>{row.historicalPlayerName}</strong>{isUnlinked && <div className="mt-1 inline-block rounded bg-slate-950 px-2 py-0.5 text-xs font-black text-amber-300">NOT LINKED</div>}<div className={isUnlinked ? "mt-1 text-xs font-medium text-slate-800" : "text-xs text-slate-500"}>{row.sourceFilename} · source row {row.sourceRow} · CSV row {row.csvRow}</div></td><td className="p-2 text-lg font-bold">{row.score}</td><td className="min-w-80 space-y-2 p-2"><div className={currentName ? "font-bold text-emerald-300" : "font-bold text-amber-200"}>{currentName ? `Linked to ${currentName}` : decision ? "Explicitly left unresolved — not linked" : row.identity.status === "ambiguous" ? "Ambiguous suggestion — review required" : "Unresolved — review required"}</div><div className={isUnlinked ? "text-xs text-amber-100/80" : "text-xs text-slate-400"}>Evidence: {row.identity.matchedSource} · confidence {row.identity.confidence}%</div>{row.identity.candidates.map((candidate) => <div key={candidate.playerId} className="text-sm text-amber-200">Suggestion only: {candidate.screenName} ({candidate.confidence}%)</div>)}<div className="flex flex-wrap gap-2"><button type="button" onClick={() => setSearching(row.fingerprint)} className="rounded bg-blue-700 px-3 py-1 font-bold">{currentName ? "Change player" : "Find / Link Existing Player"}</button><button type="button" onClick={() => leaveUnresolved(row)} className="rounded border border-slate-500 px-3 py-1">Leave unresolved</button></div>{searching === row.fingerprint && <ExistingPlayerPicker historicalDisplayName={row.historicalPlayerName} selectLabel="Link & remember identity" onCancel={() => setSearching(null)} onSelect={(player) => { setDecisions((current) => ({ ...current, [row.fingerprint]: { playerId: player.id, canonicalScreenName: player.screen_name, selectionSource: "manual" } })); setSearching(null) }} />}</td><td className="p-2">{existingBestScore ?? "—"}</td><td className="p-2 font-bold">{ACTION_LABELS[category]}</td></tr>
        })}</tbody></table></div>
        <div className="mt-4 flex items-center justify-between"><button type="button" disabled={paged.page <= 1} onClick={() => setPageNumber((page) => page - 1)} className="rounded border border-slate-600 px-3 py-2 disabled:opacity-40">Previous</button><span>Page {paged.page} of {paged.totalPages}</span><button type="button" disabled={paged.page >= paged.totalPages} onClick={() => setPageNumber((page) => page + 1)} className="rounded border border-slate-600 px-3 py-2 disabled:opacity-40">Next</button></div>
      </section>

      <section className="mt-6 rounded-xl border border-emerald-800 bg-emerald-950/20 p-5"><h2 className="text-2xl font-bold">4. Import {preview.courseCode}</h2><p className="mt-2 text-slate-300">All legitimate observations are preserved. Resolved players update current best only when the incoming score is lower. Explicitly unresolved rows are stored without a best record.</p>{pendingReview > 0 && <p className="mt-3 font-bold text-amber-200">Review required for {pendingReview} row(s): select a player or explicitly leave unresolved.</p>}{preview.issues.length > 0 && <p className="mt-3 font-bold text-red-200">Remove invalid or duplicate rows and preview again before import.</p>}<button type="button" disabled={!canImport} onClick={() => setConfirming(true)} className="mt-4 rounded bg-emerald-700 px-5 py-3 font-bold disabled:bg-slate-700">Import {preview.courseCode}</button></section>
    </>}

    {confirming && <div role="dialog" aria-modal="true" className="mt-5 rounded-xl border-2 border-amber-500 bg-amber-950/50 p-5"><h2 className="text-xl font-bold">Confirm {courseCode} import</h2><p className="mt-2">This calls the protected All-Time apply function. It does not import the other difficulty or any Combined record.</p><div className="mt-4 flex gap-3"><button type="button" onClick={() => void applyImport()} className="rounded bg-emerald-700 px-4 py-2 font-bold">Confirm and import</button><button type="button" onClick={() => setConfirming(false)} className="rounded border border-slate-500 px-4 py-2">Cancel</button></div></div>}
    {importResult && <div role="status" className="mt-5 rounded border border-emerald-600 bg-emerald-950/50 p-5 text-emerald-100"><h2 className="font-bold">All-Time CSV import completed</h2><pre className="mt-2 overflow-x-auto text-xs">{JSON.stringify(importResult.result, null, 2)}</pre>{importResult.identityMemory && <p className="mt-2">Verified aliases remembered: {importResult.identityMemory.created}; already known: {importResult.identityMemory.alreadyKnown}; conflicts: {importResult.identityMemory.conflicts.length}; failures: {importResult.identityMemory.failures.length}.</p>}</div>}
  </main>
}

function Summary({ label, value }: { label: string; value: number }) { return <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 capitalize"><div className="text-sm text-slate-400">{label}</div><strong className="text-2xl">{value}</strong></div> }
