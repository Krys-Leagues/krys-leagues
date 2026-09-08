"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { createBrowserSupabaseClient } from "@/lib/supabase/browser"

type Preview = {
  source: {
    rowCount: number
    sourceFilename: string
    parserVersion: string
    sourceSha256: string
    packageValidationPassed: boolean
    parserErrors: number
    manifest: {
      import_ready: {
        total_logical_observations: number
        played_scored: number
        blank_unplayed: number
        blank_unplayed_evidence_excluded: number
        zero_scores: number
        negative_scores: number
        positive_scores: number
        quarantined_rows: number
        pending_amateur_rows: number
        malformed: number
        duplicate_fingerprints: number
      }
      evidence: { blank_unplayed_evidence_rows: number }
      finalization: {
        finalizedThrough: string
        currentIncompletePeriod: string
        activePeriodPolicy: string
        currentPeriodReason: string
      }
    }
    periods: { period: string; periodId: number; rows: number }[]
  }
  identity: { exact: number; mapped: number; ambiguous: number; unresolved: number }
  productionOverlap: {
    available: boolean
    exactDuplicateRows: number
    missingFromProductionRows: number
    productionOnlyRows: number
    trueConflictRows: number
  }
  preflight: {
    ready: boolean
    playedRows: number
    blankUnplayedRows: number
    identityBlockedRows: number
    quarantinedRows: number
    blockedReasons: string[]
  }
  productionReadError: string | null
}

const supabase = createBrowserSupabaseClient()
const FINAL_SOURCE_ROWS = 19015

async function readPreview() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error("An authenticated site-admin session is required.")
  const response = await fetch("/api/admin/monthly-website-recovery/repaired-preview", {
    headers: { Authorization: "Bearer " + token },
    cache: "no-store",
  })
  const body = await response.json() as Preview & { error?: string }
  if (!response.ok) throw new Error(body.error || "The repaired Monthly preview could not be loaded.")
  return body
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded border border-zinc-700 bg-black p-3"><div className="text-xs uppercase text-zinc-500">{label}</div><div className="text-2xl font-black">{value.toLocaleString()}</div></div>
}

export default function RepairedMonthlyPreflight() {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState("")
  const [commitError, setCommitError] = useState("")
  const [commitResult, setCommitResult] = useState("")
  const [isCommitting, setIsCommitting] = useState(false)

  useEffect(() => {
    void readPreview().then(setPreview).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "The repaired Monthly preview could not be loaded."))
  }, [])

  if (error) return <main className="mx-auto max-w-6xl p-6 text-white"><Link href="/admin/import" className="text-indigo-300">← Import Center</Link><p role="alert" className="mt-5 rounded border border-red-700 bg-red-950 p-4">{error}</p></main>
  if (!preview) return <main className="mx-auto max-w-6xl p-6 text-white"><p>Loading repaired Monthlies preflight…</p></main>

  const { manifest, periods } = preview.source
  const august = periods.find(period => period.period === "2026 August")
  const september = periods.find(period => period.period === "2026 September")
  const finalization = manifest.finalization
  const importReady = manifest.import_ready
  const missingRows = preview.productionOverlap.missingFromProductionRows
  const canCommit = preview.source.packageValidationPassed
    && preview.source.rowCount === FINAL_SOURCE_ROWS
    && importReady.played_scored === FINAL_SOURCE_ROWS
    && preview.source.parserErrors === 0
    && preview.identity.ambiguous === 0
    && preview.identity.unresolved === 0
    && preview.preflight.identityBlockedRows === 0
    && preview.productionOverlap.trueConflictRows === 0
    && preview.preflight.ready

  async function commitMissingRows() {
    const currentPreview = preview
    if (!canCommit || isCommitting || !currentPreview) return
    const confirmed = window.confirm(`This protected action will insert exactly ${missingRows.toLocaleString()} missing Monthly score rows. Existing scores will not be overwritten. Continue?`)
    if (!confirmed) return

    setCommitError("")
    setCommitResult("")
    setIsCommitting(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error("An authenticated site-admin session is required.")
      const response = await fetch("/api/admin/monthly-website-recovery/apply", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({
          p_source_filename: currentPreview.source.sourceFilename,
          p_source_sha256: currentPreview.source.sourceSha256,
          p_parser_version: currentPreview.source.parserVersion,
          p_source_row_count: currentPreview.source.rowCount,
        }),
      })
      const body = await response.json() as { error?: string; validatedRows?: number }
      if (!response.ok) throw new Error(body.error || "The protected Monthly import was rejected before completion.")
      setCommitResult(`Protected Monthly import completed: ${body.validatedRows?.toLocaleString() ?? missingRows.toLocaleString()} rows inserted.`)
      setPreview(await readPreview())
    } catch (caught: unknown) {
      setCommitError(caught instanceof Error ? caught.message : "The protected Monthly import could not be completed.")
    } finally {
      setIsCommitting(false)
    }
  }

  return <main className="mx-auto max-w-6xl p-6 text-white">
    <Link href="/admin/import" className="text-indigo-300">← Import Center</Link>
    <h1 className="mt-2 text-3xl font-black">Repaired Historical Monthlies Preflight</h1>
    <p className="mt-2 text-zinc-300">The preflight is the safety gate for the provenance-preserving repaired score package. No data changes occur until the protected action below is explicitly confirmed.</p>

    <section className="mt-6 rounded-xl border border-zinc-700 bg-zinc-900 p-5">
      <h2 className="text-xl font-bold">Repaired finalization scope</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Finalized through (August 2026)" value={finalization.finalizedThrough === "2026 August" ? 1 : 0} />
        <Stat label="August 2026 score rows" value={august?.rows ?? 0} />
        <Stat label="September 2026 score rows" value={september?.rows ?? 0} />
        <Stat label="Import-ready numeric rows" value={importReady.played_scored} />
      </div>
      <p className="mt-4 rounded border border-amber-700 bg-amber-950 p-3 text-amber-100"><strong>Current period blocked:</strong> {finalization.currentPeriodReason}</p>
      <p className="mt-3 text-sm text-zinc-400">The legacy website-recovery manifest remains provenance only. {finalization.activePeriodPolicy}</p>
    </section>

    <section className="mt-6 rounded-xl border border-zinc-700 bg-zinc-900 p-5">
      <h2 className="text-xl font-bold">Score semantics</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Played / scored" value={importReady.played_scored} />
        <Stat label="Zero = played at par" value={importReady.zero_scores} />
        <Stat label="Negative scores" value={importReady.negative_scores} />
        <Stat label="Positive scores" value={importReady.positive_scores} />
      </div>
      <p className="mt-4 text-sm text-zinc-400">Blank/unplayed course slots remain evidence-only and are not import rows.</p>
    </section>

    <section className="mt-6 rounded-xl border border-zinc-700 bg-zinc-900 p-5">
      <h2 className="text-xl font-bold">Production overlap</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Exact duplicates" value={preview.productionOverlap.exactDuplicateRows} />
        <Stat label="Missing from Production" value={preview.productionOverlap.missingFromProductionRows} />
        <Stat label="Production-only" value={preview.productionOverlap.productionOnlyRows} />
        <Stat label="True conflicts" value={preview.productionOverlap.trueConflictRows} />
      </div>
      <p className="mt-4 text-sm text-zinc-400">Identity blocked: {preview.preflight.identityBlockedRows.toLocaleString()} · Quarantined: {preview.preflight.quarantinedRows.toLocaleString()}</p>
    </section>

    <section className="mt-6 rounded-xl border border-amber-700 bg-amber-950/40 p-5">
      <h2 className="text-xl font-bold">Protected Production import</h2>
      <p className="mt-2 text-amber-100">The action re-runs the logical Production preflight immediately before writing and submits only rows currently classified as missing.</p>
      <p className="mt-3 text-lg font-bold">Rows to insert: {missingRows.toLocaleString()}</p>
      <p className="mt-2 text-sm text-zinc-300">Exact duplicates remain untouched. True conflicts, identity blockers, package changes, malformed rows, blank/unplayed slots, Atlantis quarantine, and September 2026 data block the action.</p>
      <button
        type="button"
        className="mt-4 rounded border border-amber-300 bg-amber-300 px-4 py-3 font-bold text-black disabled:cursor-not-allowed disabled:border-zinc-600 disabled:bg-zinc-700 disabled:text-zinc-400"
        disabled={!canCommit || isCommitting}
        onClick={() => void commitMissingRows()}
      >
        {isCommitting ? "Protected import processing…" : `Commit ${missingRows.toLocaleString()} missing Monthly scores`}
      </button>
      {!canCommit && <p className="mt-3 text-sm text-red-200">Protected import disabled: all package, identity, and conflict gates must pass for the final 19,015-row package.</p>}
      {commitError && <p role="alert" className="mt-3 rounded border border-red-700 bg-red-950 p-3 text-red-100">{commitError}</p>}
      {commitResult && <p role="status" className="mt-3 rounded border border-green-700 bg-green-950 p-3 text-green-100">{commitResult}</p>}
    </section>
  </main>
}
