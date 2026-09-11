import "server-only"

import { createClient } from "@supabase/supabase-js"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

function matchAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Match admin server access is not configured.")
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  const url = new URL(request.url)
  const seasonId = url.searchParams.get("seasonId")?.trim()
  const divisionNumberParam = url.searchParams.get("divisionNumber")

  if (!seasonId) return json({ error: "seasonId is required." }, 400)

  let divisionNumber: number | undefined
  if (divisionNumberParam !== null) {
    divisionNumber = Number(divisionNumberParam)
    if (!Number.isInteger(divisionNumber) || divisionNumber <= 0) {
      return json({ error: "divisionNumber must be a positive integer." }, 400)
    }
  }

  try {
    const supabase = matchAdminClient()
    const query = supabase
      .from("match_division_course_overrides")
      .select(
        divisionNumber === undefined
          ? "division_number, game1_course_override, game2_course_override, game3_course_override"
          : "game1_course_override, game2_course_override, game3_course_override"
      )
      .eq("season_id", seasonId)

    const result =
      divisionNumber === undefined
        ? await query.order("division_number", { ascending: true })
        : await query.eq("division_number", divisionNumber).maybeSingle()

    if (result.error) return json({ error: result.error.message }, 503)
    return json({ data: result.data ?? (divisionNumber === undefined ? [] : null) })
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Match course overrides could not be loaded." },
      503
    )
  }
}
