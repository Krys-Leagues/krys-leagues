import { randomUUID } from "node:crypto"

import { authorizedAdminClient, loadIdentityDirectory } from "@/app/api/admin/records/arizona-modern/_shared"
import { MonthlyCommitValidationError, validateMonthlyWebsiteCommitRequest } from "@/lib/importer/monthlyWebsiteCommitValidation"

function jsonError(message: string, status: number, correlationId?: string) {
  return Response.json({ error: message, correlationId }, { status, headers: { "Cache-Control": "no-store" } })
}

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const correlationId = randomUUID()
  const authorization = await authorizedAdminClient(request)
  if (authorization.error) return authorization.error

  try {
    const directory = await loadIdentityDirectory(authorization.supabase!)
    const body = await request.json()
    const prepared = await validateMonthlyWebsiteCommitRequest(body, directory)

    const { data, error } = await authorization.supabase!.rpc("commit_historical_monthly_preview", {
      p_source_filename: prepared.request.p_source_filename,
      p_source_sha256: prepared.request.p_source_sha256,
      p_parser_version: prepared.request.p_parser_version,
      p_source_row_count: prepared.request.p_source_row_count,
      p_rows: prepared.expectedRows,
    })
    if (error) return jsonError("The Monthly database transaction rejected this source.", 422, correlationId)
    return Response.json({ data, correlationId, validatedRows: prepared.expectedRows.length }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (error instanceof MonthlyCommitValidationError) return jsonError(error.message, error.status, correlationId)
    return jsonError("The Monthly Apply request could not be completed.", 400, correlationId)
  }
}
