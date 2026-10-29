import { randomUUID } from "node:crypto"

import { authorizedAdminClient, loadIdentityDirectory } from "@/app/api/admin/records/arizona-modern/_shared"
import { MonthlyCommitValidationError, validateMonthlyWebsiteCommitRequest } from "@/lib/importer/monthlyWebsiteCommitValidation"

export const dynamic = "force-dynamic"

function jsonError(message: string, status: number, correlationId: string) {
  return Response.json({ error: message, correlationId, rpcInvoked: false }, { status, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request) {
  const correlationId = randomUUID()
  const authorization = await authorizedAdminClient(request)
  if (authorization.error) return authorization.error

  try {
    const directory = await loadIdentityDirectory(authorization.supabase!)
    const prepared = await validateMonthlyWebsiteCommitRequest(await request.json(), directory)
    return Response.json({
      dryRun: true,
      rpcInvoked: false,
      stage: "ready-for-rpc",
      correlationId,
      source: prepared.source,
      requestBytes: prepared.requestBytes,
      expectedPayloadRows: prepared.expectedRows.length,
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (error instanceof MonthlyCommitValidationError) return jsonError(error.message, error.status, correlationId)
    return jsonError("The Monthly dry-run validation could not be completed.", 400, correlationId)
  }
}
