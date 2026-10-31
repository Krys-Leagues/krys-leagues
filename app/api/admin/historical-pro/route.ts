import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"

import { authorizedAdminClient, loadIdentityDirectory } from "@/app/api/admin/records/arizona-modern/_shared"
import { parseHistoricalProRecovery } from "@/lib/importer/adapters/historicalProParser"

export const runtime = "nodejs"

const evidenceRoot = path.join(process.cwd(), "docs", "historical-sources", "pro", "google-sheets-recovery")

async function readEvidence(filename: string) {
  return readFile(path.join(evidenceRoot, filename), "utf8")
}

export async function GET(request: Request) {
  const authorization = await authorizedAdminClient(request)
  if (authorization.error) return authorization.error

  try {
    const [scoreCsv, currentCsv, conflictsCsv, missingCsv, pairingCsv, manifestText] = await Promise.all([
      readEvidence("historical-pro-scorecards.csv"),
      readEvidence("historical-pro-current-incomplete.csv"),
      readEvidence("historical-pro-conflicts.csv"),
      readEvidence("historical-pro-missing-periods.csv"),
      readEvidence("historical-pro-season-pairings.csv"),
      readEvidence("source-manifest.json"),
    ])
    const manifest = JSON.parse(manifestText) as { artifacts?: Array<{ path: string; sha256: string }> }
    const expectedSourceSha256 = manifest.artifacts?.find((artifact) => artifact.path === "historical-pro-scorecards.csv")?.sha256 ?? null
    const sourceSha256 = createHash("sha256").update(scoreCsv, "utf8").digest("hex")
    const preview = parseHistoricalProRecovery(scoreCsv, currentCsv, conflictsCsv, missingCsv, sourceSha256, expectedSourceSha256, pairingCsv)
    const directory = await loadIdentityDirectory(authorization.supabase!)
    const matches = directory.matchNames(preview.seasonHistoricalNames)
    const identityReviews = matches.map((match) => ({
      historicalPlayerName: match.importedName,
      status: match.autoLinkEligible && match.playerId ? "resolved" as const : match.playerId ? "ambiguous" as const : "unresolved" as const,
      canonicalPlayerId: match.autoLinkEligible ? match.playerId : null,
      canonicalPlayerName: match.autoLinkEligible ? match.matchedName : null,
      candidatePlayerId: match.autoLinkEligible ? null : match.playerId,
      candidatePlayerName: match.autoLinkEligible ? null : match.matchedName,
      matchedSource: match.evidence,
      confidence: match.confidence,
    }))
    return Response.json({ preview, identityReviews }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Historical Pro preview failed." }, { status: 400 })
  }
}
