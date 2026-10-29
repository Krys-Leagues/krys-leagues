import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"

import { authorizedAdminClient, loadIdentityDirectory } from "@/app/api/admin/records/arizona-modern/_shared"
import { historicalStrokeV2PreviewFingerprint, parseHistoricalStrokeV2Package } from "@/lib/importer/adapters/historicalStrokeV2"

export const runtime = "nodejs"

const evidenceRoot = path.join(process.cwd(), "docs", "historical-sources", "stroke", "google-sheets-recovery")

async function readEvidence(filename: string) {
  return readFile(path.join(evidenceRoot, filename), "utf8")
}

export async function GET(request: Request) {
  const authorization = await authorizedAdminClient(request)
  if (authorization.error) return authorization.error

  try {
    const [normalizedCsv, manifestJson, pairingCsv, malformedCsv] = await Promise.all([
      readEvidence("historical-stroke-normalized.csv"),
      readEvidence("stroke-source-manifest.json"),
      readEvidence("historical-stroke-pairings.csv"),
      readEvidence("historical-stroke-season5-malformed.csv"),
    ])
    const normalizedSourceSha256 = createHash("sha256").update(normalizedCsv, "utf8").digest("hex")
    const preview = await parseHistoricalStrokeV2Package({ normalizedCsv, sourceFilename: "historical-stroke-normalized.csv", normalizedSourceSha256, manifestJson, pairingCsv, malformedCsv })
    const previewFingerprint = await historicalStrokeV2PreviewFingerprint(preview)
    const names = Array.from(new Set(preview.observations
      .filter((observation) => observation.source.sourceStatus === "HISTORICAL / COMPLETE")
      .map((observation) => observation.historicalPlayerName)
      .filter(Boolean)))
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
    const canonicalPlayerIds = directory.rawPlayers.filter((player) => directory.canonicalId(player.id) === player.id).map((player) => player.id)
    return Response.json({ preview, previewFingerprint, normalizedSourceSha256, identityReviews, canonicalPlayerIds }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("Historical Stroke V2 review load failed", error)
    return Response.json({ error: "The preserved Historical Stroke V2 review package could not be loaded." }, { status: 500 })
  }
}
