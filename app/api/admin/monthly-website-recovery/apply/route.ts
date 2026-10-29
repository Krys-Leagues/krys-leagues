import { randomUUID } from "node:crypto"

import { authorizedAdminClient, loadIdentityDirectory } from "@/app/api/admin/records/arizona-modern/_shared"
import { MonthlyCommitValidationError, validateMonthlyWebsiteCommitRequest } from "@/lib/importer/monthlyWebsiteCommitValidation"

function jsonError(message: string, status: number, correlationId?: string) {
  return Response.json({ error: message, correlationId }, { status, headers: { "Cache-Control": "no-store" } })
}

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const correlationId = randomUUID()
  let stage = "request-received"
  const authorization = await authorizedAdminClient(request)
  if (authorization.error) return authorization.error

  try {
    stage = "authorization-passed"
    const directory = await loadIdentityDirectory(authorization.supabase!)
    const body = await request.json()
    const prepared = await validateMonthlyWebsiteCommitRequest(body, directory)
    stage = "validation-passed"

    stage = "before-rpc"
    const { data, error } = await authorization.supabase!.rpc("commit_historical_monthly_preview", {
      p_source_filename: prepared.request.p_source_filename,
      p_source_sha256: prepared.request.p_source_sha256,
      p_parser_version: prepared.request.p_parser_version,
      p_source_row_count: prepared.request.p_source_row_count,
      p_rows: prepared.expectedRows,
    })
    if (error) {
      console.error("Monthly commit RPC failed", {
        correlationId,
        stage,
        validatedRows: prepared.expectedRows.length,
        requestBytes: prepared.requestBytes,
        code: error.code ?? null,
        message: error.message ?? null,
        details: error.details ?? null,
        hint: error.hint ?? null,
      })
      return jsonError("The Monthly database transaction rejected this source.", 422, correlationId)
    }
    console.info("Monthly commit RPC succeeded", {
      correlationId,
      stage: "rpc-succeeded",
      validatedRows: prepared.expectedRows.length,
      requestBytes: prepared.requestBytes,
    })
    return Response.json({ data, correlationId, validatedRows: prepared.expectedRows.length }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("Monthly commit request failed before RPC completion", {
      correlationId,
      stage,
      error: error instanceof Error ? error.message : String(error),
    })
    if (error instanceof MonthlyCommitValidationError) return jsonError(error.message, error.status, correlationId)
    return jsonError("The Monthly Apply request could not be completed.", 400, correlationId)
  }
}
