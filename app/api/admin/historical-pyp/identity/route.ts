import { readFile } from "node:fs/promises"
import path from "node:path"

import { authorizedAdminClient, loadIdentityDirectory } from "@/app/api/admin/records/arizona-modern/_shared"
import { buildVerifiedAliasMemoryRequests, rememberVerifiedPlayerAliases } from "@/lib/importer/rememberVerifiedPlayerAliases"

export const runtime = "nodejs"

type IdentityRequest = {
  historicalPlayerName?: unknown
  canonicalPlayerId?: unknown
}

const evidencePath = path.join(process.cwd(), "docs", "historical-sources", "pyp", "google-sheets-recovery", "historical-pyp-normalized.csv")

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

    const normalizedCsv = await readFile(evidencePath, "utf8")
    if (!normalizedCsv.split(/\r?\n/).some((line) => line.split(",")[2] === historicalPlayerName)) {
      return Response.json({ error: "The historical name is not present in the preserved PYP source." }, { status: 400 })
    }

    const directory = await loadIdentityDirectory(authorization.supabase!)
    const canonicalPlayerId = directory.canonicalId(requestedPlayerId)
    const canonicalPlayer = directory.rawPlayers.find((player) => directory.canonicalId(player.id) === canonicalPlayerId && player.id === canonicalPlayerId)
    if (!canonicalPlayer) return Response.json({ error: "Choose an existing canonical Global Player." }, { status: 400 })

    const memory = await rememberVerifiedPlayerAliases(
      buildVerifiedAliasMemoryRequests([{
        historicalDisplayName: historicalPlayerName,
        playerId: canonicalPlayerId,
        playerScreenName: canonicalPlayer.screen_name,
        explicitlyApproved: true,
      }]),
      async (args) => authorization.supabase!.rpc("remember_verified_player_alias", args),
    )
    if (memory.conflicts.length || memory.failures.length) {
      return Response.json({ error: "The identity confirmation could not be persisted.", identityMemory: memory }, { status: 409 })
    }
    return Response.json({ ok: true, canonicalPlayerId, canonicalPlayerName: canonicalPlayer.screen_name, identityMemory: memory })
  } catch (error) {
    console.error("Historical PYP identity confirmation failed", error)
    return Response.json({ error: "Historical PYP identity confirmation failed." }, { status: 400 })
  }
}
