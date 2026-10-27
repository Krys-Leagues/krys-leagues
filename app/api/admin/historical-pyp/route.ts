import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"

import { authorizedAdminClient, loadIdentityDirectory } from "@/app/api/admin/records/arizona-modern/_shared"
import { historicalPypPreviewFingerprint, parseHistoricalPypPackage } from "@/lib/importer/adapters/historicalPypParser"
import { classifyHistoricalPypPreflight } from "@/lib/importer/historicalPypPreflight"

export const runtime = "nodejs"

const evidenceRoot = path.join(process.cwd(), "docs", "historical-sources", "pyp", "google-sheets-recovery")

async function readEvidence(filename: string) {
  return readFile(path.join(evidenceRoot, filename), "utf8")
}

export async function GET(request: Request) {
  const authorization = await authorizedAdminClient(request)
  if (authorization.error) return authorization.error

  try {
    const [normalizedCsv, opponentEvidenceCsv, rankConflictCsv, manifestText] = await Promise.all([
      readEvidence("historical-pyp-normalized.csv"),
      readEvidence("historical-pyp-opponent-evidence.csv"),
      readEvidence("historical-pyp-rank-conflicts.csv"),
      readEvidence("source-manifest.json"),
    ])
    const sourceSha256 = createHash("sha256").update(normalizedCsv, "utf8").digest("hex")
    const manifest = JSON.parse(manifestText) as { artifactHashes?: Record<string, string> }
    const expectedSourceSha256 = manifest.artifactHashes?.["historical-pyp-normalized.csv"]?.toLowerCase() ?? null
    const preview = parseHistoricalPypPackage(normalizedCsv, opponentEvidenceCsv, rankConflictCsv)
    const names = [...new Set(preview.rows.map((row) => row.historicalPlayerName))]
    const directory = await loadIdentityDirectory(authorization.supabase!)
    const identityReviews = directory.matchNames(names).map((match) => ({
      historicalPlayerName: match.importedName,
      status: match.autoLinkEligible && match.playerId ? "resolved" as const : match.playerId ? "ambiguous" as const : "unresolved" as const,
      canonicalPlayerId: match.autoLinkEligible ? match.playerId : null,
      canonicalPlayerName: match.autoLinkEligible ? match.matchedName : null,
      candidatePlayerId: match.autoLinkEligible ? null : match.playerId,
      candidatePlayerName: match.autoLinkEligible ? null : match.matchedName,
      matchedSource: match.evidence,
      confidence: match.confidence,
    }))
    const identityByName = new Map(identityReviews.map((review) => [review.historicalPlayerName, review]))
    const preflightSourceRows = preview.rows.map((row) => ({
      ...row,
      canonicalPlayerId: identityByName.get(row.historicalPlayerName)?.canonicalPlayerId ?? null,
      canonicalOpponentPlayerId: null,
      identityStatus: identityByName.get(row.historicalPlayerName)?.status ?? "unresolved" as const,
    }))
    const productionResult = await authorization.supabase!.from("historical_pyp_observations").select("source_fingerprint, season_number, division, game_number, historical_player_name, canonical_player_id, course_1_holes_won, course_2_holes_won, total_holes_won, wins, losses, draws, points, published_placement, source_state, opponent_historical_player_name, opponent_canonical_player_id")
    const productionPreflight = productionResult.error
      ? { status: /relation .* does not exist|could not find the table/i.test(productionResult.error.message) ? "SCHEMA_NOT_INSTALLED" as const : "UNAVAILABLE" as const, message: productionResult.error.message, sourceRowCount: preview.rows.length, productionRowCount: null, summary: [], conflicts: [] }
      : (() => {
        const result = classifyHistoricalPypPreflight(preflightSourceRows, productionResult.data || [])
        return {
          status: "READY" as const,
          message: null,
          sourceRowCount: result.sourceRowCount,
          productionRowCount: result.productionRowCount,
          summary: result.summary,
          conflicts: result.conflicts.map((item) => ({
            seasonNumber: item.seasonNumber,
            division: item.division,
            sourceState: item.sourceState,
            identityStatus: item.identityStatus,
            sourceFingerprint: item.sourceFingerprint,
            productionFingerprint: item.productionFingerprint,
            conflictFields: item.conflictFields,
            source: item.source,
            production: item.production,
          })),
        }
      })()
    const canonicalPlayerIds = directory.rawPlayers.filter((player) => directory.canonicalId(player.id) === player.id).map((player) => player.id)
    return Response.json({
      preview,
      previewFingerprint: historicalPypPreviewFingerprint(preview),
      sourceSha256,
      expectedSourceSha256,
      sourceShaMatches: !expectedSourceSha256 || expectedSourceSha256 === sourceSha256,
      identityReviews,
      canonicalPlayerIds,
      productionPreflight,
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("Historical PYP review load failed", error)
    return Response.json({ error: "The preserved Historical PYP review package could not be loaded." }, { status: 500 })
  }
}
