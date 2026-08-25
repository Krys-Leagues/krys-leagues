import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"

function jsonError(message: string, status: number, correlationId?: string) {
  return Response.json({ error: message, correlationId }, { status, headers: { "Cache-Control": "no-store" } })
}

async function authorizedAdmin(request: Request) {
  const [scheme, accessToken] = (request.headers.get("authorization") ?? "").split(" ")
  if (scheme?.toLowerCase() !== "bearer" || !accessToken) return { error: jsonError("Authentication is required.", 401) }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken)
  if (userError || !userData.user) return { error: jsonError("The authenticated session is invalid.", 401) }
  const { data: siteAdmin, error: authorizationError } = await supabase.rpc("is_current_user_site_admin")
  if (authorizationError) return { error: jsonError("Administrator authorization could not be verified.", 503) }
  if (!siteAdmin) return { error: jsonError("Administrator authorization is required.", 403) }
  return { supabase }
}

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const correlationId = randomUUID()
  const authorized = await authorizedAdmin(request)
  if (authorized.error) return authorized.error
  try {
    const body = await request.json() as Record<string, unknown>
    const sourceFilename = typeof body.p_source_filename === "string" ? body.p_source_filename : ""
    const sourceSha256 = typeof body.p_source_sha256 === "string" ? body.p_source_sha256 : ""
    const parserVersion = typeof body.p_parser_version === "string" ? body.p_parser_version : ""
    const sourceRowCount = typeof body.p_source_row_count === "number" ? body.p_source_row_count : 0
    const rows = body.p_rows
    if (!sourceFilename || !/^[0-9a-f]{64}$/.test(sourceSha256) || !parserVersion || !Number.isInteger(sourceRowCount) || !Array.isArray(rows) || rows.length === 0) return jsonError("The reviewed Monthly payload is incomplete.", 400, correlationId)
    const { data, error } = await authorized.supabase.rpc("commit_historical_monthly_preview", { p_source_filename: sourceFilename, p_source_sha256: sourceSha256, p_parser_version: parserVersion, p_source_row_count: sourceRowCount, p_rows: rows })
    if (error) return jsonError("The Monthly database transaction rejected this source.", 422, correlationId)
    return Response.json({ data, correlationId }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return jsonError("The Monthly Apply request could not be completed.", 400, correlationId)
  }
}

