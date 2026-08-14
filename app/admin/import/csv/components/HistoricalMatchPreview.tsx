"use client"

import { useMemo, useState } from "react"

import type { PlayerMatch } from "@/lib/importer/matchPlayers"
import type { HistoricalMatchPreview as Preview } from "@/lib/importer/adapters/matchAdapter"
import {
  buildHistoricalMatchCommitPayload,
  historicalMatchAutoLinkDecision,
  historicalMatchCommitBlockers,
  historicalMatchEffectiveIdentityDecisions,
  historicalMatchIdentityReviewSummary,
  historicalMatchStandingKey,
  HISTORICAL_MATCH_PARSER_VERSION,
  type HistoricalMatchIdentityDecisions,
} from "@/lib/importer/historicalMatchCommit"
import { supabase } from "@/lib/supabase"
import {
  buildVerifiedAliasMemoryRequests,
  rememberVerifiedPlayerAliases,
  type VerifiedAliasMemorySummary,
} from "@/lib/importer/rememberVerifiedPlayerAliases"
import ExistingPlayerPicker from "./ExistingPlayerPicker"
import CommittedHistoricalMatchIdentities from "./CommittedHistoricalMatchIdentities"

type Props = {
  preview: Preview
  identityCandidates: Map<string, PlayerMatch>
  identityLoading: boolean
  sourceFilename: string
  sourceSha256: string
  previewFingerprint: string
  sourceReference?: string
}

type CommitResult = {
  historical_match_import_id: string
  idempotent: boolean
  standing_count: number
  course_appearance_count: number
  resolved_identity_count: number
  unresolved_identity_count: number
}

function databaseErrorMessage(error: { code?: string; message: string }) {
  const { code, message } = error
  if (code === "42501" || /authorization|required|permission/i.test(message)) return `Authorization error: ${message}`
  if (/already has a different|already committed to another season/i.test(message)) return `Conflict: ${message}`
  if (/preview|payload|requires|must|invalid|duplicate|does not agree/i.test(message)) return `Payload validation error: ${message}`
  return `Database error: ${message}`
}

export default function HistoricalMatchPreview({
  preview,
  identityCandidates,
  identityLoading,
  sourceFilename,
  sourceSha256,
  previewFingerprint,
  sourceReference = "",
}: Props) {
  const [decisions, setDecisions] = useState<HistoricalMatchIdentityDecisions>({})
  const [confirming, setConfirming] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [commitError, setCommitError] = useState("")
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null)
  const [identityMemoryResult, setIdentityMemoryResult] = useState<VerifiedAliasMemorySummary | null>(null)
  const [rememberingIdentities, setRememberingIdentities] = useState(false)
  const [searchingStanding, setSearchingStanding] = useState<string | null>(null)
  const [selectedPlayerNames, setSelectedPlayerNames] = useState<Record<string, string>>({})
  const blockers = useMemo(() => historicalMatchCommitBlockers(preview), [preview])
  const effectiveDecisions = useMemo(
    () => historicalMatchEffectiveIdentityDecisions(preview, identityCandidates, decisions),
    [decisions, identityCandidates, preview]
  )
  const reviewSummary = useMemo(
    () => historicalMatchIdentityReviewSummary(preview, identityCandidates, decisions),
    [decisions, identityCandidates, preview]
  )
  const courseCount = preview.audit.courseAppearancesPlayed + preview.audit.courseAppearancesUnplayed

  function approveCandidate(divisionNumber: number, finalRank: number, match?: PlayerMatch) {
    if (!match?.playerId || match.status === "new") return
    const key = historicalMatchStandingKey(divisionNumber, finalRank)
    setDecisions((current) => ({
      ...current,
      [key]: {
        canonicalPlayerId: match.playerId,
        resolutionNote: `Explicitly approved ${match.evidence} candidate from Historical Match preview.`,
        selectionSource: "manual",
      },
    }))
    if (match.matchedName) {
      setSelectedPlayerNames((current) => ({ ...current, [key]: match.matchedName! }))
    }
  }

  function leaveUnresolved(divisionNumber: number, finalRank: number) {
    const key = historicalMatchStandingKey(divisionNumber, finalRank)
    setDecisions((current) => ({ ...current, [key]: { canonicalPlayerId: null, selectionSource: "unresolved" } }))
    setSelectedPlayerNames((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  async function commitHistoricalSeason() {
    if (blockers.length > 0 || !sourceSha256 || !previewFingerprint) return
    setCommitting(true)
    setCommitError("")
    setCommitResult(null)
    setIdentityMemoryResult(null)
    const payload = buildHistoricalMatchCommitPayload(preview, effectiveDecisions, sourceFilename, sourceSha256, previewFingerprint, sourceReference)
    const { data, error } = await supabase.rpc("commit_historical_match_preview", payload)
    setConfirming(false)
    if (error) {
      setCommitting(false)
      setCommitError(databaseErrorMessage(error))
      return
    }
    const result = Array.isArray(data) ? data[0] : data
    if (!result) {
      setCommitting(false)
      setCommitError("Database error: the commit RPC returned no result.")
      return
    }
    setCommitResult(result as CommitResult)
    const memoryRequests = buildVerifiedAliasMemoryRequests(
      preview.divisions.flatMap((division) => division.standings.map((standing) => {
        const key = historicalMatchStandingKey(division.divisionNumber, standing.finalRank)
        const decision = decisions[key]
        return {
          historicalDisplayName: standing.historicalDisplayName,
          playerId: decision?.canonicalPlayerId ?? null,
          playerScreenName: selectedPlayerNames[key] ?? null,
          explicitlyApproved: decision?.selectionSource === "manual",
        }
      }))
    )
    setRememberingIdentities(true)
    const memoryResult = await rememberVerifiedPlayerAliases(
      memoryRequests,
      async (request) => supabase.rpc("remember_verified_player_alias", request)
    )
    setIdentityMemoryResult(memoryResult)
    setRememberingIdentities(false)
    setCommitting(false)
  }

  async function retryIdentityMemoryFailures() {
    if (!identityMemoryResult) return
    const requests = [...identityMemoryResult.conflicts, ...identityMemoryResult.failures]
      .map((failure) => failure.request)
    if (requests.length === 0) return
    setRememberingIdentities(true)
    const retry = await rememberVerifiedPlayerAliases(
      requests,
      async (request) => supabase.rpc("remember_verified_player_alias", request)
    )
    setIdentityMemoryResult({
      created: identityMemoryResult.created + retry.created,
      alreadyKnown: identityMemoryResult.alreadyKnown + retry.alreadyKnown,
      conflicts: retry.conflicts,
      failures: retry.failures,
    })
    setRememberingIdentities(false)
  }

  return (
    <section className="mt-8 space-y-6 rounded-2xl border border-emerald-800 bg-emerald-950/20 p-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-emerald-300">Historical Match review and commit</p>
        <h2 className="mt-2 text-3xl font-bold">Season {preview.seasonNumber ?? "not detected"}</h2>
        <p className="mt-2 text-zinc-300">{preview.historicalLabel || "Historical label not detected"}</p>
        <p className="text-zinc-300">Layout: {preview.layout === "single_side" ? "single-side historical Match" : preview.layout === "duplicated_final_side" ? "duplicated final-side historical Match" : "ambiguous — review required"}</p>
        <p className="text-zinc-400">Year: {preview.year ?? "unknown / not supplied"} · Evidence: {preview.evidenceLevel === "standings_only" ? "standings only" : "aggregate course"}</p>
        <p className="mt-3 font-semibold text-emerald-200">No opponents or fixtures are inferred. Upload and identity review do not write to the database.</p>
      </div>

      <details className="rounded-lg border border-zinc-700 bg-zinc-950 p-4">
        <summary className="cursor-pointer font-bold">Source audit details</summary>
        <div className="mt-3 space-y-1 break-all font-mono text-xs text-zinc-400">
          <div>Filename: {sourceFilename}</div><div>Source SHA-256: {sourceSha256 || "calculating…"}</div>
          <div>Preview fingerprint: {previewFingerprint || "calculating…"}</div><div>Parser: {HISTORICAL_MATCH_PARSER_VERSION}</div>
          {sourceReference && <div>Source reference: {sourceReference}</div>}
        </div>
      </details>

      {preview.divisions.map((division) => (
        <section key={division.divisionNumber} className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
          <h3 className="text-2xl font-bold">Division {division.divisionNumber}</h3>
          <div className="mt-4 overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="border-b border-zinc-700 text-left text-zinc-400">
            <th className="p-2">Rank / frozen name</th><th className="p-2">Totals</th>{preview.courses.map((course) => <th key={course} className="p-2">{course}</th>)}<th className="p-2">Identity review</th>
          </tr></thead><tbody>{division.standings.map((standing) => {
            const key = historicalMatchStandingKey(division.divisionNumber, standing.finalRank)
            const match = identityCandidates.get(standing.historicalDisplayName)
            const autoDecision = historicalMatchAutoLinkDecision(match)
            const explicitDecision = decisions[key]
            const decision = effectiveDecisions[key]
            const isAutoLinked = Boolean(autoDecision && !explicitDecision)
            return <tr key={key} className="border-b border-zinc-800 align-top">
              <td className="p-2"><strong>#{standing.finalRank} {standing.historicalDisplayName}</strong>{standing.warnings.map((warning) => <div key={warning} className="mt-1 text-xs text-red-300">{warning}</div>)}</td>
              <td className="whitespace-nowrap p-2">P {standing.played} · W {standing.wins} · L {standing.losses} · D {standing.draws} · PTS {standing.points} · HW {standing.holesWon}</td>
              {standing.courses.map((course) => <td key={course.courseName} className="p-2">{course.played ? <><div className="font-bold text-emerald-300">Played · {course.outcome}</div><div>HW {course.holesWon}</div></> : <div className="font-bold text-zinc-400">Unplayed</div>}</td>)}
              <td className="min-w-72 space-y-2 p-2">
                {identityLoading ? <div className="text-zinc-400">Checking read-only identity evidence…</div> : match?.playerId && match.status !== "new" ? <>
                  <div className={isAutoLinked ? "font-bold text-emerald-200" : "text-amber-200"}>{isAutoLinked ? "Linked automatically — verified existing identity" : `Candidate: ${match.matchedName}`}</div>
                  {isAutoLinked && <div className="text-zinc-200">Linked current player: {match.matchedName}</div>}<div className="font-mono text-xs text-zinc-500">{match.playerId}</div>
                  <div className="text-xs text-zinc-400">Evidence: {isAutoLinked ? match.autoLinkReason : match.evidence} · confidence {match.confidence}%</div>
                  <div className="flex flex-wrap gap-2">{!isAutoLinked && <button type="button" onClick={() => approveCandidate(division.divisionNumber, standing.finalRank, match)} className="rounded bg-emerald-700 px-3 py-1 font-bold">Approve &amp; remember identity</button>}<button type="button" onClick={() => setSearchingStanding(key)} className="rounded bg-blue-700 px-3 py-1 font-bold">{isAutoLinked ? "Change linked player" : "Find / Link Existing Player"}</button><button type="button" onClick={() => leaveUnresolved(division.divisionNumber, standing.finalRank)} className="rounded border border-zinc-600 px-3 py-1">Leave unresolved</button></div>
                </> : <><div className="text-zinc-400">No candidate · unresolved</div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setSearchingStanding(key)} className="rounded bg-blue-700 px-3 py-1 font-bold">Find / Link Existing Player</button><button type="button" onClick={() => leaveUnresolved(division.divisionNumber, standing.finalRank)} className="rounded border border-zinc-600 px-3 py-1">Leave unresolved</button></div></>}
                <div className={`text-xs font-bold ${decision?.canonicalPlayerId ? "text-emerald-300" : "text-zinc-400"}`}>Review status: {decision?.canonicalPlayerId ? `${isAutoLinked ? "auto-linked" : "manually linked"} to ${selectedPlayerNames[key] || match?.matchedName || "selected player"}` : explicitDecision ? "left unresolved" : "needs review"}</div>
                {searchingStanding === key && <ExistingPlayerPicker historicalDisplayName={standing.historicalDisplayName} selectLabel="Link & remember identity" onCancel={() => setSearchingStanding(null)} onSelect={(player) => {
                  setDecisions((current) => ({ ...current, [key]: { canonicalPlayerId: player.id, resolutionNote: "Explicitly selected through Find / Link Existing Player before commit.", selectionSource: "manual" } }))
                  setSelectedPlayerNames((current) => ({ ...current, [key]: player.screen_name }))
                  setSearchingStanding(null)
                }} />}
                {explicitDecision?.selectionSource === "manual" && <div className="text-xs text-blue-200">This identity will be remembered globally after the historical season commits successfully.</div>}
              </td>
            </tr>
          })}</tbody></table></div>
        </section>
      ))}

      <section className="rounded-xl border border-zinc-700 bg-zinc-950 p-4">
        <h3 className="text-xl font-bold">Final commit review</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div>Season: {preview.seasonNumber ?? "invalid"}</div><div>Label: {preview.historicalLabel}</div><div>Evidence: {preview.evidenceLevel === "standings_only" ? "standings only" : "aggregate course"}</div>
          <div>Divisions: {preview.audit.populatedDivisions}</div><div>Standings: {preview.audit.realPlayerRows}</div><div>Course appearances: {courseCount}</div>
          <div>Played: {preview.audit.courseAppearancesPlayed}</div><div>Unplayed: {preview.audit.courseAppearancesUnplayed}</div><div>Auto-linked identities: {reviewSummary.autoLinked}</div>
          <div>Manually approved identities: {reviewSummary.manuallyApproved}</div><div>Unresolved identities: {reviewSummary.unresolved}</div><div>Needs review: {reviewSummary.needsReview}</div><div>Authoritative fixtures: {preview.audit.authoritativeFixtures}</div>
        </div>
        {blockers.length > 0 && <div className="mt-4 rounded border border-red-700 bg-red-950/40 p-3 text-red-200"><strong>Commit blocked</strong>{blockers.map((blocker) => <div key={blocker}>{blocker}</div>)}</div>}
        {!sourceSha256 || !previewFingerprint ? <p className="mt-4 text-amber-200">Commit is unavailable until both deterministic hashes are ready.</p> : null}
        {identityLoading ? <p className="mt-4 text-amber-200">Commit is unavailable until read-only identity candidates finish loading.</p> : null}
        <button type="button" onClick={() => setConfirming(true)} disabled={blockers.length > 0 || !sourceSha256 || !previewFingerprint || identityLoading || committing || Boolean(commitResult)} className="mt-4 rounded-lg bg-emerald-700 px-5 py-3 font-bold disabled:cursor-not-allowed disabled:bg-zinc-700">Commit Historical Match Season</button>
      </section>

      {confirming && <div role="dialog" aria-modal="true" className="rounded-xl border-2 border-amber-500 bg-amber-950/50 p-5">
        <h3 className="text-xl font-bold">Confirm Season {preview.seasonNumber} historical commit</h3><p className="mt-2">This freezes the validated historical source facts plus the shown automatic and manual identity selections. Unresolved identities remain allowed. It creates no fixtures and does not modify managed Match.</p>
        <div className="mt-4 flex gap-3"><button type="button" onClick={() => void commitHistoricalSeason()} disabled={committing} className="rounded bg-emerald-700 px-4 py-2 font-bold">{committing ? "Committing…" : "Confirm and commit"}</button><button type="button" onClick={() => setConfirming(false)} disabled={committing} className="rounded border border-zinc-500 px-4 py-2">Cancel</button></div>
      </div>}
      {commitError && <div role="alert" className="rounded border border-red-700 bg-red-950/40 p-4 text-red-200">{commitError}</div>}
      {commitResult && <div role="status" className="rounded border border-emerald-600 bg-emerald-950/50 p-4 text-emerald-100"><h3 className="font-bold">{commitResult.idempotent ? "Historical season already committed — idempotent success" : "Historical season committed successfully"}</h3><div className="mt-2">Import UUID: <span className="font-mono">{commitResult.historical_match_import_id}</span></div><div>Season: {preview.seasonNumber} · Idempotent: {commitResult.idempotent ? "yes" : "no"}</div><div>Standings: {commitResult.standing_count} · Course appearances: {commitResult.course_appearance_count}</div><div>Resolved: {commitResult.resolved_identity_count} · Unresolved: {commitResult.unresolved_identity_count}</div></div>}
      {commitResult && <div className="rounded border border-blue-700 bg-blue-950/40 p-4 text-blue-100"><h3 className="font-bold">Global identity memory</h3>{rememberingIdentities ? <p className="mt-2">Remembering explicitly approved identities…</p> : identityMemoryResult ? <><div className="mt-2">Verified identities remembered globally: {identityMemoryResult.created}</div><div>Already known globally: {identityMemoryResult.alreadyKnown}</div><div>Identity-memory conflicts: {identityMemoryResult.conflicts.length}</div><div>Identity-memory failures: {identityMemoryResult.failures.length}</div>{identityMemoryResult.conflicts.length + identityMemoryResult.failures.length > 0 && <p className="mt-2 font-bold text-amber-200">Historical season committed successfully. Some identity relationships could not be remembered globally.</p>}{[...identityMemoryResult.conflicts, ...identityMemoryResult.failures].map((failure) => <div key={`${failure.request.p_player_id}:${failure.request.p_alias}`} className="mt-2 rounded border border-amber-700 p-2 text-amber-200"><strong>{failure.request.p_alias}</strong>: {failure.message}</div>)}{identityMemoryResult.conflicts.length + identityMemoryResult.failures.length > 0 && <button type="button" disabled={rememberingIdentities} onClick={() => void retryIdentityMemoryFailures()} className="mt-3 rounded bg-blue-700 px-3 py-2 font-bold">Retry failed identity memory</button>}</> : null}</div>}
      {commitResult && <CommittedHistoricalMatchIdentities initialImportId={commitResult.historical_match_import_id} />}

      {preview.ignoredRows.length > 0 && <details><summary className="cursor-pointer font-bold">Ignored structural/template rows ({preview.ignoredRows.length})</summary><div className="mt-2 space-y-2">{preview.ignoredRows.map((row, index) => <div key={`${row.sourceRow}-${index}`} className="rounded border border-zinc-700 bg-zinc-950 p-3">Division {row.divisionNumber}, CSV row {row.sourceRow}: {row.sourceName || "[blank name]"} — {row.reason}</div>)}</div></details>}
    </section>
  )
}
