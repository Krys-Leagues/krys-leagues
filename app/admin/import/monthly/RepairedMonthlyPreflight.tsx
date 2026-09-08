"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { createBrowserSupabaseClient } from "@/lib/supabase/browser"

type Preview = {
  source: {
    rowCount: number
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

  return <main className="mx-auto max-w-6xl p-6 text-white">
    <Link href="/admin/import" className="text-indigo-300">← Import Center</Link>
    <h1 className="mt-2 text-3xl font-black">Repaired Historical Monthlies Preflight</h1>
    <p className="mt-2 text-zinc-300">Read-only review of the provenance-preserving repaired score package. No source, identity, or Production data is changed here.</p>

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
  </main>
}
