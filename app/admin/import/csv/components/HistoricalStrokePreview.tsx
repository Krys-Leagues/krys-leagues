"use client"

import { useState } from "react"

import type { HistoricalStrokePreview as Preview } from "@/lib/importer/adapters/historicalStrokeParser"
import {
  buildHistoricalStrokeCommitPayload,
  categorizeHistoricalStrokeDatabaseError,
  historicalStrokeCommitBlockers,
  historicalStrokeCommitState,
  historicalStrokeStandingKey,
  type HistoricalStrokeCommitResult,
  type HistoricalStrokeIdentityDecisions,
  type HistoricalStrokeIdentityReview,
} from "@/lib/importer/historicalStrokeCommit"
import { supabase } from "@/lib/supabase"

type Props = {
  preview: Preview
  identityReviews: Map<string, HistoricalStrokeIdentityReview>
  identityLoading: boolean
  identityLoadError: string
  sourceFilename: string
  sourceSha256: string
  previewFingerprint: string
}

type StandingRow = {
  id: string
  division_number: number
  source_row_number: number
  historical_display_name: string
  player_id: string | null
}

type IdentityApplyFailure = {
  key: string
  historicalDisplayName: string
  message: string
}

export default function HistoricalStrokePreview({
  preview,
  identityReviews,
  identityLoading,
  identityLoadError,
  sourceFilename,
  sourceSha256,
  previewFingerprint,
}: Props) {
  const [decisions, setDecisions] = useState<HistoricalStrokeIdentityDecisions>({})
  const [confirming, setConfirming] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [commitError, setCommitError] = useState("")
  const [commitResult, setCommitResult] = useState<HistoricalStrokeCommitResult | null>(null)
  const [identityFailures, setIdentityFailures] = useState<IdentityApplyFailure[]>([])
  const [finalResolvedCount, setFinalResolvedCount] = useState<number | null>(null)

  const standings = preview.divisions.flatMap((division) => division.standings)
  const reviews = standings.map((standing) => identityReviews.get(standing.historicalDisplayName)).filter((review): review is HistoricalStrokeIdentityReview => Boolean(review))
  const blockers = historicalStrokeCommitBlockers(preview, sourceSha256, previewFingerprint, reviews)
  const verifiedCount = reviews.filter((review) => review.status === "verified").length
  const manualCount = Object.values(decisions).filter((decision) => decision.canonicalPlayerId).length
  const preCommitResolved = standings.filter((standing) => {
    const key = historicalStrokeStandingKey(standing.divisionNumber, standing.sourceRow)
    return identityReviews.get(standing.historicalDisplayName)?.status === "verified" || Boolean(decisions[key]?.canonicalPlayerId)
  }).length

  function approveCandidate(
    divisionNumber: number,
    sourceRow: number,
    playerId: string,
    playerName: string,
    evidence: string,
    confidence: number
  ) {
    const key = historicalStrokeStandingKey(divisionNumber, sourceRow)
    setDecisions((current) => ({
      ...current,
      [key]: {
        canonicalPlayerId: playerId,
        canonicalPlayerName: playerName,
        resolutionNote: `Explicitly approved ${evidence} candidate (${confidence}% confidence) in Historical Stroke preview.`,
      },
    }))
  }

  function leaveUnresolved(divisionNumber: number, sourceRow: number) {
    const key = historicalStrokeStandingKey(divisionNumber, sourceRow)
    setDecisions((current) => ({ ...current, [key]: { canonicalPlayerId: null } }))
  }

  async function applyReviewedIdentities(importId: string) {
    const { data, error } = await supabase
      .from("historical_stroke_standings")
      .select("id, division_number, source_row_number, historical_display_name, player_id")
      .eq("historical_stroke_import_id", importId)
    if (error) throw error
    const rows = (data ?? []) as StandingRow[]
    const rowByKey = new Map(rows.map((row) => [historicalStrokeStandingKey(row.division_number, row.source_row_number), row]))
    const failures: IdentityApplyFailure[] = []

    for (const standing of standings) {
      const key = historicalStrokeStandingKey(standing.divisionNumber, standing.sourceRow)
      const review = identityReviews.get(standing.historicalDisplayName)
      const manual = decisions[key]
      const playerId = manual?.canonicalPlayerId ?? (review?.status === "verified" ? review.canonicalPlayerId : null)
      if (!playerId) continue
      const row = rowByKey.get(key)
      if (!row) {
        failures.push({ key, historicalDisplayName: standing.historicalDisplayName, message: "Committed standing could not be read back." })
        continue
      }
      if (row.player_id === playerId && review?.status === "verified" && !manual?.canonicalPlayerId) continue
      const note = manual?.canonicalPlayerId
        ? manual.resolutionNote ?? "Explicit Historical Stroke identity approval."
        : "Reused unique verified Global Player alias during Historical Stroke import."
      const { error: identityError } = await supabase.rpc("set_historical_stroke_standing_identity", {
        p_historical_stroke_standing_id: row.id,
        p_player_id: playerId,
        p_resolution_note: note,
      })
      if (identityError) failures.push({ key, historicalDisplayName: standing.historicalDisplayName, message: categorizeHistoricalStrokeDatabaseError(identityError) })
      else row.player_id = playerId
    }

    setIdentityFailures(failures)
    setFinalResolvedCount(rows.filter((row) => row.player_id !== null).length)
    return failures
  }

  async function commitHistoricalSeason() {
    if (blockers.length > 0 || identityLoading || committing || commitResult) return
    setCommitting(true)
    setCommitError("")
    setIdentityFailures([])
    try {
      const payload = buildHistoricalStrokeCommitPayload(preview, sourceFilename, sourceSha256, previewFingerprint)
      const { data, error } = await supabase.rpc("commit_historical_stroke_preview", payload)
      if (error) throw error
      const result = (Array.isArray(data) ? data[0] : data) as HistoricalStrokeCommitResult | null
      if (!result) throw new Error("The commit RPC returned no result.")
      setCommitResult(result)
      setConfirming(false)
      const failures = await applyReviewedIdentities(result.historical_stroke_import_id)
      if (failures.length > 0) setCommitError("The historical source was committed, but one or more reviewed identities could not be remembered. The failed approvals are listed below and must be retried.")
    } catch (error) {
      const databaseError = error as { code?: string; message?: string }
      setCommitError(categorizeHistoricalStrokeDatabaseError({ code: databaseError.code, message: databaseError.message ?? "Unknown database response." }))
    } finally {
      setCommitting(false)
    }
  }

  async function retryIdentityApprovals() {
    if (!commitResult || committing) return
    setCommitting(true)
    setCommitError("")
    try {
      const failures = await applyReviewedIdentities(commitResult.historical_stroke_import_id)
      if (failures.length > 0) setCommitError("Some reviewed identities still could not be remembered. No frozen source facts were changed by these failures.")
    } catch (error) {
      const databaseError = error as { code?: string; message?: string }
      setCommitError(categorizeHistoricalStrokeDatabaseError({ code: databaseError.code, message: databaseError.message ?? "Unknown database response." }))
    } finally {
      setCommitting(false)
    }
  }

  return (
    <section className="mt-8 space-y-6 rounded-2xl border border-cyan-800 bg-cyan-950/20 p-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-widest text-cyan-300">Historical Stroke read-only review</p>
        <h2 className="mt-2 text-3xl font-bold">Season {preview.season.seasonNumber ?? "not detected"}</h2>
        <p className="mt-2 text-zinc-300">{preview.season.rawHeader || "Historical label not detected"}</p>
        <p className="text-zinc-400">Year: {preview.season.historicalYear ?? "unknown"} · {preview.season.rawEndDateText || "No end-date text"}</p>
        <p className="mt-3 font-semibold text-cyan-200">Aggregate history only. No opponents, fixtures, or managed Stroke operations are created.</p>
      </header>

      <details open className="rounded-lg border border-zinc-700 bg-zinc-950 p-4">
        <summary className="cursor-pointer font-bold">Source and deterministic audit</summary>
        <div className="mt-3 space-y-1 break-all font-mono text-xs text-zinc-400">
          <div>Filename: {sourceFilename}</div><div>Source SHA-256: {sourceSha256 || "calculating…"}</div>
          <div>Preview fingerprint: {previewFingerprint || "calculating…"}</div><div>Parser: {preview.parserVersion}</div>
          <div>Literal label: {preview.season.historicalSeasonLabel} · Raw end date: {preview.season.rawEndDateText}</div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div>Rows scanned: {preview.audit.sourceRowsScanned}</div><div>Columns: {preview.audit.columnsPerRow ?? "inconsistent"}</div>
          <div>Divisions: {preview.audit.divisionsFound}</div><div>Populated: {preview.audit.populatedDivisions}</div>
          <div>Standings: {preview.audit.standingsParsed}</div><div>BYE: {preview.audit.byeRowsClassified}</div>
          <div>Templates: {preview.audit.templateRowsClassified}</div><div>Malformed: {preview.audit.malformedRealPlayerRows}</div>
          <div>Left/right conflicts: {preview.audit.leftRightConflicts}</div><div>Statistical conflicts: {preview.audit.statisticalConflicts}</div>
          <div>Appearances: {preview.audit.totalCourseAppearances}</div><div>Played: {preview.audit.playedCourseAppearances}</div>
          <div>Unplayed: {preview.audit.unplayedCourseAppearances}</div><div>Negative scores: {preview.audit.negativePlayedScores}</div>
          <div>Positive scores: {preview.audit.positivePlayedScores}</div><div>Numeric-zero scores: {preview.audit.numericZeroPlayedScores}</div>
          <div>Historical fixtures: {preview.audit.historicalFixtures}</div>
        </div>
      </details>

      {preview.divisions.filter((division) => division.populated).map((division) => (
        <section key={division.divisionNumber} className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
          <h3 className="text-2xl font-bold">Division {division.divisionNumber}</h3>
          <div className="mt-4 overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="border-b border-zinc-700 text-left text-zinc-400">
            <th className="p-2">Source / frozen name</th><th className="p-2">Totals</th><th className="p-2">Course appearances</th><th className="p-2">Global identity review</th>
          </tr></thead><tbody>{division.standings.map((standing) => {
            const key = historicalStrokeStandingKey(division.divisionNumber, standing.sourceRow)
            const review = identityReviews.get(standing.historicalDisplayName)
            const decision = decisions[key]
            const candidates = review?.candidate?.candidates.length ? review.candidate.candidates : review?.candidate?.playerId ? [{ playerId: review.candidate.playerId, screenName: review.candidate.screenName ?? "Unknown", matchedSource: review.candidate.matchedSource, confidence: review.candidate.confidence, reasons: [] }] : []
            return <tr key={key} className="border-b border-zinc-800 align-top">
              <td className="p-2"><strong>{standing.historicalDisplayName}</strong><div className="text-xs text-zinc-500">CSV row {standing.sourceRow} · source pos {standing.sourcePosition ?? "—"} · display pos {standing.sourceDisplayPosition ?? "—"}</div></td>
              <td className="whitespace-nowrap p-2">P {standing.played} · W {standing.wins} · D {standing.draws} · L {standing.losses} · PTS {standing.points} · STROKES {standing.strokes}</td>
              <td className="min-w-64 p-2">{standing.courses.map((course) => <div key={course.courseOrder}><strong>{course.courseName}:</strong> {course.played ? `${course.score} · ${course.outcome}` : "- · unplayed"}</div>)}</td>
              <td className="min-w-80 space-y-2 p-2">
                {identityLoading ? <div className="text-zinc-400">Loading read-only identity evidence…</div> : review?.status === "verified" ? <><div className="font-bold text-emerald-300">Verified global match</div><div>{review.candidate?.screenName}</div><div className="font-mono text-xs text-zinc-500">{review.canonicalPlayerId}</div><div className="text-xs text-zinc-400">Exact verified alias · 100%</div></> : review?.status === "conflict" ? <><div className="font-bold text-red-300">Verified alias conflict — commit blocked</div><div className="font-mono text-xs text-zinc-500">{review.conflictPlayerIds.join(", ")}</div></> : candidates.length > 0 ? <>{candidates.map((candidate) => <div key={candidate.playerId} className="rounded border border-zinc-700 p-2"><div className="text-amber-200">Suggestion: {candidate.screenName}</div><div className="font-mono text-xs text-zinc-500">{candidate.playerId}</div><div className="text-xs text-zinc-400">Evidence: {candidate.matchedSource} · confidence {candidate.confidence}%{candidate.reasons.length ? ` · ${candidate.reasons.join(", ")}` : ""}</div><button type="button" onClick={() => approveCandidate(division.divisionNumber, standing.sourceRow, candidate.playerId, candidate.screenName, candidate.matchedSource, candidate.confidence)} className="mt-2 rounded bg-emerald-700 px-3 py-1 font-bold">Approve &amp; remember identity</button></div>)}<button type="button" onClick={() => leaveUnresolved(division.divisionNumber, standing.sourceRow)} className="rounded border border-zinc-600 px-3 py-1">Leave unresolved</button></> : <><div className="text-zinc-400">No authoritative match · unresolved</div><button type="button" onClick={() => leaveUnresolved(division.divisionNumber, standing.sourceRow)} className="rounded border border-zinc-600 px-3 py-1">Leave unresolved</button></>}
                {decision?.canonicalPlayerId && <div className="font-bold text-emerald-300">Approved: {decision.canonicalPlayerName}<div className="font-mono text-xs font-normal text-zinc-500">{decision.canonicalPlayerId}</div></div>}
              </td>
            </tr>
          })}</tbody></table></div>
        </section>
      ))}

      <details className="rounded-xl border border-zinc-700 bg-zinc-950 p-4"><summary className="cursor-pointer font-bold">Structural rows ({preview.byeRows.length + preview.templateRows.length})</summary><div className="mt-3">BYE rows: {preview.byeRows.length} · Template slots: {preview.templateRows.length}. These are excluded from standings and identity review.</div></details>

      <section className="rounded-xl border border-zinc-700 bg-zinc-950 p-4">
        <h3 className="text-xl font-bold">Final commit review</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"><div>Standings: {standings.length}</div><div>Verified reuse: {verifiedCount}</div><div>Manual approvals: {manualCount}</div><div>Unresolved allowed: {standings.length - preCommitResolved}</div><div>Course appearances: {preview.audit.totalCourseAppearances}</div><div>Fixtures: 0</div></div>
        {identityLoadError && <div className="mt-4 rounded border border-red-700 bg-red-950/40 p-3 text-red-200">Identity evidence could not be loaded: {identityLoadError}</div>}
        {blockers.length > 0 && <div className="mt-4 rounded border border-red-700 bg-red-950/40 p-3 text-red-200"><strong>Commit blocked</strong>{blockers.map((blocker) => <div key={blocker}>{blocker}</div>)}</div>}
        <button type="button" onClick={() => setConfirming(true)} disabled={blockers.length > 0 || identityLoading || Boolean(identityLoadError) || committing || Boolean(commitResult)} className="mt-4 rounded-lg bg-cyan-700 px-5 py-3 font-bold disabled:cursor-not-allowed disabled:bg-zinc-700">Commit Historical Stroke Season {preview.season.seasonNumber ?? ""}</button>
      </section>

      {confirming && <div role="dialog" aria-modal="true" className="rounded-xl border-2 border-amber-500 bg-amber-950/50 p-5"><h3 className="text-xl font-bold">Confirm Historical Stroke Season {preview.season.seasonNumber}</h3><p className="mt-2">This freezes source facts as aggregate Historical Stroke history. Unresolved players may remain unresolved; historical names remain frozen; no opponents or fixtures are created. Re-importing the identical source is idempotent, while a different source for this season is rejected.</p><p className="mt-2 text-amber-200">The source is committed first. Verified and explicitly approved identities are then remembered through the Global Identity RPC; any failed identity step is reported for retry.</p><div className="mt-4 flex gap-3"><button type="button" onClick={() => void commitHistoricalSeason()} disabled={committing} className="rounded bg-cyan-700 px-4 py-2 font-bold">{committing ? "Committing…" : "Confirm and commit"}</button><button type="button" onClick={() => setConfirming(false)} disabled={committing} className="rounded border border-zinc-500 px-4 py-2">Cancel</button></div></div>}
      {commitError && <div role="alert" className="rounded border border-red-700 bg-red-950/40 p-4 text-red-200">{commitError}</div>}
      {identityFailures.length > 0 && <div className="rounded border border-red-700 bg-red-950/40 p-4 text-red-200"><strong>Identity approvals requiring retry</strong>{identityFailures.map((failure) => <div key={failure.key}>{failure.historicalDisplayName}: {failure.message}</div>)}<button type="button" onClick={() => void retryIdentityApprovals()} disabled={committing} className="mt-3 rounded bg-amber-700 px-3 py-2 font-bold disabled:bg-zinc-700">{committing ? "Retrying…" : "Retry identity approvals"}</button></div>}
      {commitResult && <div role="status" className="rounded border border-emerald-600 bg-emerald-950/50 p-4 text-emerald-100"><h3 className="font-bold">{historicalStrokeCommitState(commitResult) === "idempotent" ? "Identical Historical Stroke import already exists" : "New Historical Stroke import committed"}</h3><div className="mt-2">Import UUID: <span className="font-mono">{commitResult.historical_stroke_import_id}</span></div><div>Idempotent: {commitResult.idempotent ? "yes" : "no"} · Standings: {commitResult.standing_count} · Course appearances: {commitResult.course_appearance_count}</div><div>Resolved after identity application: {finalResolvedCount ?? commitResult.resolved_identity_count} · Unresolved: {finalResolvedCount === null ? commitResult.unresolved_identity_count : commitResult.standing_count - finalResolvedCount}</div></div>}
    </section>
  )
}
