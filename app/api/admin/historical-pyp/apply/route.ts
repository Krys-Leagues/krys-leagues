import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"

import { authorizedAdminClient, loadIdentityDirectory } from "@/app/api/admin/records/arizona-modern/_shared"
import {
  buildHistoricalPypCommitPayload,
  historicalPypCommitBlockers,
  historicalPypCommitFingerprint,
  type HistoricalPypIdentityDecision,
  type HistoricalPypIdentityReview,
  type HistoricalPypPairingDecision,
} from "@/lib/importer/historicalPypCommit"
import { parseHistoricalPypPackage } from "@/lib/importer/adapters/historicalPypParser"

export const runtime = "nodejs"

const evidenceRoot = path.join(process.cwd(), "docs", "historical-sources", "pyp", "google-sheets-recovery")

async function readEvidence(filename: string) {
  return readFile(path.join(evidenceRoot, filename), "utf8")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export async function POST(request: Request) {
  const authorization = await authorizedAdminClient(request)
  if (authorization.error) return authorization.error

  try {
    const body = await request.json() as {
      sourceSha256?: unknown
      commitFingerprint?: unknown
      identityDecisions?: unknown
      pairingDecisions?: unknown
    }
    const [normalizedCsv, opponentEvidenceCsv, rankConflictCsv, manifestText] = await Promise.all([
      readEvidence("historical-pyp-normalized.csv"),
      readEvidence("historical-pyp-opponent-evidence.csv"),
      readEvidence("historical-pyp-rank-conflicts.csv"),
      readEvidence("source-manifest.json"),
    ])
    const sourceSha256 = createHash("sha256").update(normalizedCsv, "utf8").digest("hex")
    const manifest = JSON.parse(manifestText) as { artifactHashes?: Record<string, string> }
    const expectedSourceSha256 = manifest.artifactHashes?.["historical-pyp-normalized.csv"]?.toLowerCase() ?? ""
    const preview = parseHistoricalPypPackage(normalizedCsv, opponentEvidenceCsv, rankConflictCsv)
    const directory = await loadIdentityDirectory(authorization.supabase!)
    const identityReviews: HistoricalPypIdentityReview[] = directory.matchNames([...new Set(preview.rows.map((row) => row.historicalPlayerName))]).map((match) => ({
      historicalPlayerName: match.importedName,
      status: match.autoLinkEligible && match.playerId ? "resolved" : match.playerId ? "ambiguous" : "unresolved",
      canonicalPlayerId: match.autoLinkEligible ? directory.canonicalId(match.playerId!) : null,
      canonicalPlayerName: match.autoLinkEligible ? match.matchedName : null,
    }))

    if (body.sourceSha256 !== sourceSha256 || sourceSha256 !== expectedSourceSha256) {
      return Response.json({ error: "The PYP source changed or does not match its manifest. Preview the current source again." }, { status: 409 })
    }
    if (typeof body.commitFingerprint !== "string") {
      return Response.json({ error: "A reviewed PYP commit fingerprint is required." }, { status: 400 })
    }

    const identityDecisions: Record<string, HistoricalPypIdentityDecision> = {}
    const historicalNames = new Set(preview.rows.map((row) => row.historicalPlayerName))
    if (isRecord(body.identityDecisions)) {
      for (const [historicalPlayerName, value] of Object.entries(body.identityDecisions)) {
        if (!historicalNames.has(historicalPlayerName)) {
          return Response.json({ error: "An identity decision does not belong to the preserved PYP source." }, { status: 400 })
        }
        if (!isRecord(value) || typeof value.canonicalPlayerId !== "string") continue
        const canonicalPlayerId = directory.canonicalId(value.canonicalPlayerId)
        const canonicalPlayer = directory.rawPlayers.find((player) => player.id === canonicalPlayerId && directory.canonicalId(player.id) === canonicalPlayerId)
        if (!canonicalPlayer) return Response.json({ error: "A selected Global Player is not a current canonical player." }, { status: 400 })
        identityDecisions[historicalPlayerName] = {
          historicalPlayerName,
          canonicalPlayerId,
          canonicalPlayerName: canonicalPlayer.screen_name,
          selectionSource: "manual",
        }
      }
    }
    const pairingDecisions: Record<string, HistoricalPypPairingDecision> = {}
    if (isRecord(body.pairingDecisions)) {
      for (const [reviewKey, value] of Object.entries(body.pairingDecisions)) {
        const review = preview.pairingReviews.find((candidate) => candidate.reviewKey === reviewKey)
        if (!review || !isRecord(value) || value.status !== "confirmed" || typeof value.opponentHistoricalPlayerName !== "string") {
          return Response.json({ error: "A pairing decision does not match the current PYP review source." }, { status: 400 })
        }
        if (!review.candidateOpponentHistoricalPlayerNames.includes(value.opponentHistoricalPlayerName)) {
          return Response.json({ error: "A pairing decision selected an opponent outside the current source candidates." }, { status: 400 })
        }
        let opponentCanonicalPlayerId: string | null = null
        if (typeof value.opponentCanonicalPlayerId === "string") {
          opponentCanonicalPlayerId = directory.canonicalId(value.opponentCanonicalPlayerId)
          const opponent = directory.rawPlayers.find((player) => player.id === opponentCanonicalPlayerId && directory.canonicalId(player.id) === opponentCanonicalPlayerId)
          if (!opponent) return Response.json({ error: "A pairing decision selected an unknown canonical opponent." }, { status: 400 })
        }
        pairingDecisions[reviewKey] = {
          reviewKey,
          status: "confirmed",
          opponentHistoricalPlayerName: value.opponentHistoricalPlayerName,
          opponentCanonicalPlayerId,
        }
      }
    }
    const fingerprint = historicalPypCommitFingerprint(preview, identityReviews, identityDecisions, pairingDecisions)
    if (fingerprint !== body.commitFingerprint) {
      return Response.json({ error: "The reviewed PYP decisions changed. Refresh the preview before committing." }, { status: 409 })
    }
    const blockers = historicalPypCommitBlockers(preview, true, identityReviews, identityDecisions, pairingDecisions)
    if (blockers.length) return Response.json({ error: "PYP import is not ready.", blockers }, { status: 409 })

    const payload = buildHistoricalPypCommitPayload(preview, "historical-pyp-normalized.csv", sourceSha256, fingerprint, identityReviews, identityDecisions, pairingDecisions)
    const { data, error } = await authorization.supabase!.rpc("commit_historical_pyp_preview", payload)
    if (error) throw new Error(error.message)
    return Response.json({ result: data, sourceSha256, commitFingerprint: fingerprint })
  } catch (error) {
    console.error("Historical PYP commit failed", error)
    return Response.json({ error: "Historical PYP commit failed. Review the source and decisions again." }, { status: 400 })
  }
}
