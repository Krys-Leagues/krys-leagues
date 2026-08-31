import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import Papa from "papaparse"

import { authorizedAdminClient, loadIdentityDirectory } from "@/app/api/admin/records/arizona-modern/_shared"
import { previewMonthlyWebsiteCsvRows } from "@/lib/importer/adapters/monthlyWebsiteAdapter"
import { buildVerifiedAliasMemoryRequests, rememberVerifiedPlayerAliases } from "@/lib/importer/rememberVerifiedPlayerAliases"

export const runtime = "nodejs"

type IdentityRequest = {
  historicalPlayerName?: unknown
  canonicalPlayerId?: unknown
}

const evidenceRoot = path.join(process.cwd(), "docs", "historical-sources", "monthly", "website-recovery")

export async function POST(request: Request) {
  const authorization = await authorizedAdminClient(request)
  if (authorization.error) return authorization.error

  try {
    const body = await request.json() as IdentityRequest
    const historicalPlayerName = typeof body.historicalPlayerName === "string" ? body.historicalPlayerName : ""
    const requestedPlayerId = typeof body.canonicalPlayerId === "string" ? body.canonicalPlayerId : ""
    if (!historicalPlayerName.trim() || !requestedPlayerId.trim()) {
      return Response.json({ error: "An exact historical name and existing canonical player are required." }, { status: 400 })
    }

    const [manifestText, csvText] = await Promise.all([
      readFile(path.join(evidenceRoot, "monthly-website-source-manifest.json"), "utf8"),
      readFile(path.join(evidenceRoot, "monthly-website-score-observations.csv"), "utf8"),
    ])
    const manifest = JSON.parse(manifestText) as { normalizedCsvSha256: string; finalization: { finalizedThrough: string } }
    const sourceSha256 = createHash("sha256").update(csvText, "utf8").digest("hex")
    if (sourceSha256 !== manifest.normalizedCsvSha256) {
      return Response.json({ error: "The preserved Monthly source changed. Refresh the review before saving an identity." }, { status: 409 })
    }
    const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true })
    if (parsed.errors.length) return Response.json({ error: "The preserved Monthly source could not be parsed." }, { status: 409 })
    const preview = previewMonthlyWebsiteCsvRows(parsed.data, { finalizedThrough: manifest.finalization.finalizedThrough })
    const isHistoricalName = preview.rows.some((row) => row.importable && row.historicalPlayerName === historicalPlayerName)
    if (!isHistoricalName) return Response.json({ error: "The exact historical name is not present in a completed Monthly source period." }, { status: 400 })

    const directory = await loadIdentityDirectory(authorization.supabase!)
    const canonicalPlayerId = directory.canonicalId(requestedPlayerId)
    const canonicalPlayer = directory.rawPlayers.find((player) => player.id === canonicalPlayerId && directory.canonicalId(player.id) === canonicalPlayerId)
    if (!canonicalPlayer) return Response.json({ error: "Choose an existing canonical Global Player." }, { status: 400 })

    const identityMemory = await rememberVerifiedPlayerAliases(
      buildVerifiedAliasMemoryRequests([{
        historicalDisplayName: historicalPlayerName,
        playerId: canonicalPlayerId,
        playerScreenName: canonicalPlayer.screen_name,
        explicitlyApproved: true,
      }]),
      async (args) => authorization.supabase!.rpc("remember_verified_player_alias", args),
    )
    if (identityMemory.conflicts.length || identityMemory.failures.length) {
      return Response.json({ error: "The identity confirmation could not be persisted.", identityMemory }, { status: 409 })
    }
    return Response.json({ ok: true, canonicalPlayerId, canonicalPlayerName: canonicalPlayer.screen_name, sourceSha256, identityMemory })
  } catch (error) {
    console.error("Historical Monthly identity confirmation failed", error)
    return Response.json({ error: "Historical Monthly identity confirmation failed." }, { status: 400 })
  }
}
