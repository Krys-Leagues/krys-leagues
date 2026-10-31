import { authorizedAdminClient, loadIdentityDirectory } from "@/app/api/admin/records/arizona-modern/_shared"
import { monthlyRepairPreflight } from "@/lib/importer/monthlyRepairedHistory"
import { FINAL_REPAIRED_MONTHLY_PARSER, FINAL_REPAIRED_MONTHLY_SOURCE, loadFinalRepairedPackage, validateMonthlyRepairedCommitRequest } from "@/lib/importer/monthlyRepairedCommitValidation"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const authorization = await authorizedAdminClient(request)
  if (authorization.error) return authorization.error

  try {
    const packageData = await loadFinalRepairedPackage()
    const directory = await loadIdentityDirectory(authorization.supabase!)
    const prepared = await validateMonthlyRepairedCommitRequest({
      p_source_filename: FINAL_REPAIRED_MONTHLY_SOURCE,
      p_source_sha256: packageData.sourceSha256,
      p_parser_version: FINAL_REPAIRED_MONTHLY_PARSER,
      p_source_row_count: packageData.rows.length,
    }, authorization.supabase!, directory)
    const periods = [...new Map(packageData.rows.map(row => [row.period_id, row])).values()]
      .sort((left, right) => Number(left.period_id) - Number(right.period_id))
      .map(period => ({
        period: period.period,
        periodId: Number(period.period_id),
        rows: packageData.rows.filter(row => row.period_id === period.period_id).length,
      }))
    const counts = packageData.manifest.counts
    const identityBlockedRows = prepared.identity.ambiguous + prepared.identity.unresolved
    const quarantineBlocksImport = prepared.quarantine.eligibleRows > 0
    const commitGateBlockingReasons = [
      prepared.source.eligibleRows !== 19015 ? "Final eligible source row count is not 19,015" : null,
      prepared.overlap.trueConflictRows > 0 ? "True Production conflicts remain" : null,
      identityBlockedRows > 0 ? "Required player identities are unresolved" : null,
      counts.malformed > 0 ? "Malformed rows remain" : null,
      counts.duplicate_logical_keys > 0 ? "Logical duplicate rows remain" : null,
      !prepared.overlap.available ? "Production overlap unavailable" : null,
      quarantineBlocksImport ? "A quarantined row is present in the eligible import payload" : null,
    ].filter((reason): reason is string => reason !== null)
    const commitGate = {
      ready: commitGateBlockingReasons.length === 0,
      blockingReasons: commitGateBlockingReasons,
      eligibleSourceRows: prepared.source.eligibleRows,
      packageRows: prepared.source.totalRows,
      packageValidationPassed: true,
      identityBlockedRows,
      trueConflictRows: prepared.overlap.trueConflictRows,
      quarantinedRows: prepared.quarantine.packageRows,
      quarantineRowsExcluded: !quarantineBlocksImport,
    }
    const preflight = monthlyRepairPreflight({
      overlap: prepared.overlap,
      playedRows: counts.import_ready_numeric_observations,
      blankUnplayedRows: counts.blank_unplayed_evidence,
      identityBlockedRows,
      requiredIdentityRows: 0,
      quarantinedRows: counts.quarantined_rows,
      malformedRows: counts.malformed,
      logicalDuplicateRows: counts.duplicate_logical_keys,
    })

    return Response.json({
      source: {
        rowCount: packageData.rows.length,
        sourceFilename: FINAL_REPAIRED_MONTHLY_SOURCE,
        parserVersion: FINAL_REPAIRED_MONTHLY_PARSER,
        sourceSha256: packageData.sourceSha256,
        packageValidationPassed: true,
        parserErrors: 0,
        manifest: {
          import_ready: {
            total_logical_observations: counts.import_ready_numeric_observations,
            played_scored: counts.import_ready_numeric_observations,
            blank_unplayed: counts.blank_unplayed_evidence,
            blank_unplayed_evidence_excluded: counts.blank_unplayed_evidence,
            zero_scores: counts.zero_scores,
            negative_scores: counts.negative_scores,
            positive_scores: counts.positive_scores,
            quarantined_rows: counts.quarantined_rows,
            pending_amateur_rows: 0,
            malformed: counts.malformed,
            duplicate_fingerprints: counts.duplicate_fingerprints,
          },
          evidence: { blank_unplayed_evidence_rows: counts.blank_unplayed_evidence },
          finalization: {
            finalizedThrough: packageData.manifest.finalization.finalizedThrough,
            currentIncompletePeriod: packageData.manifest.finalization.currentIncompletePeriod,
            activePeriodPolicy: "The final package is the only source eligible for protected import.",
            currentPeriodReason: packageData.manifest.finalization.currentPeriodReason,
          },
        },
        periods,
      },
      identity: {
        exact: prepared.identity.exact,
        mapped: prepared.identity.mapped,
        ambiguous: prepared.identity.ambiguous,
        unresolved: prepared.identity.unresolved,
      },
      productionOverlap: prepared.overlap,
      preflight,
      commitGate,
      productionReadError: null,
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "The repaired Monthly preflight could not be loaded."
    return Response.json({ error: message }, { status: 409, headers: { "Cache-Control": "no-store" } })
  }
}
