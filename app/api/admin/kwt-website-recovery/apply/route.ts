import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"

type ApplyBody = { p_source_filename?: unknown; p_source_sha256?: unknown; p_parser_version?: unknown; p_rows?: unknown }
type DatabaseError = { code?: string; message?: string }

function jsonError(error: string, correlationId: string, reason?: string, status = 400) {
  return Response.json({ error, reason, correlationId }, { status, headers: { "Cache-Control": "no-store" } })
}

function safeReason(error: DatabaseError) {
  const code = error.code ?? "unknown"
  if (code === "42501" || /authorization|required|permission/i.test(error.message ?? "")) return "Site-admin authorization was rejected by the database."
  if (code === "PGRST202" || code === "PGRST204" || /could not find the function|schema cache/i.test(error.message ?? "")) return "The Production KWT Apply RPC is unavailable or its schema cache is outdated."
  if (code === "23505" || /duplicate|unique|already exists/i.test(error.message ?? "")) return "This source conflicts with an existing KWT import or fingerprint. Retrying is idempotent."
  if (code === "57014" || /timeout|timed out|canceling statement/i.test(error.message ?? "")) return "The database timed out while applying this source. Retrying is safe and idempotent."
  if (/invalid|requires|must|does not equal|conflict|fingerprint|canonical Global Player/i.test(error.message ?? "")) return "The database rejected this source during KWT validation. Check the correlation ID in the private deployment logs."
  return "The database rejected this source. Check the correlation ID in the private deployment logs."
}

function errorStatus(error: DatabaseError) {
  const code = error.code ?? ""
  if (code === "42501") return 403
  if (code === "23505") return 409
  if (code === "PGRST202" || code === "PGRST204" || code === "57014") return 503
  return 400
}

async function authorizedAdmin(request: Request) {
  const [scheme, accessToken] = (request.headers.get("authorization") ?? "").split(" ")
  if (scheme?.toLowerCase() !== "bearer" || !accessToken) return { error: "Authentication is required.", status: 401 as const }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken)
  if (userError || !userData.user) return { error: "The authenticated session is invalid.", status: 401 as const }
  const { data: siteAdmin, error: authorizationError } = await supabase.rpc("is_current_user_site_admin")
  if (authorizationError) return { error: "Administrator authorization could not be verified.", status: 503 as const }
  if (!siteAdmin) return { error: "Administrator authorization is required.", status: 403 as const }
  return { supabase }
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const correlationId = randomUUID()
  const authorized = await authorizedAdmin(request)
  if (!("supabase" in authorized)) return jsonError(authorized.error, correlationId, undefined, authorized.status)
  const adminClient = authorized.supabase
  if (!adminClient) return jsonError("Administrator authorization could not be verified.", correlationId, undefined, 503)
  try {
    const body = await request.json() as ApplyBody
    if (typeof body.p_source_filename !== "string" || typeof body.p_source_sha256 !== "string" || typeof body.p_parser_version !== "string" || !Array.isArray(body.p_rows) || body.p_rows.length === 0) {
      return jsonError("The KWT source payload is invalid.", correlationId, "A non-empty source filename, SHA-256, parser version, and row array are required.")
    }
    if (JSON.stringify(body).length > 500_000) return jsonError("The KWT source payload is too large.", correlationId, "Apply sends one preserved source file per transaction; retry without changing the source data.", 413)
    const { data, error } = await adminClient.rpc("commit_historical_kwt_preview", {
      p_source_filename: body.p_source_filename,
      p_source_sha256: body.p_source_sha256,
      p_parser_version: body.p_parser_version,
      p_rows: body.p_rows,
    })
    if (error) {
      const databaseError = error as DatabaseError
      const reason = safeReason(databaseError)
      console.error("KWT Apply RPC failed", { correlationId, sourceFilename: body.p_source_filename, code: databaseError.code ?? "unknown", message: databaseError.message ?? "unknown" })
      return jsonError("Historical KWT Apply failed.", correlationId, reason, errorStatus(databaseError))
    }
    return Response.json({ data, correlationId }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown"
    console.error("KWT Apply request failed", { correlationId, message })
    return jsonError("Historical KWT Apply failed.", correlationId, "The Apply request could not be completed. Check the correlation ID in the private deployment logs.", 400)
  }
}
