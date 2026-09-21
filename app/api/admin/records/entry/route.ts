import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

export const runtime = "nodejs"

type EntryAction = "preview_verified_period" | "record_verified_period" | "record_normal_entry"

const RPC_NAMES: Record<EntryAction, string> = {
  preview_verified_period: "preview_all_time_verified_period_entry_v3",
  record_verified_period: "record_all_time_verified_period_entry_v3",
  record_normal_entry: "record_all_time_normal_entry",
}

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "no-store" },
})

function isEntryAction(value: unknown): value is EntryAction {
  return value === "preview_verified_period" || value === "record_verified_period" || value === "record_normal_entry"
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  try {
    const body = await request.json() as { action?: unknown; args?: unknown }
    if (!isEntryAction(body.action) || !body.args || typeof body.args !== "object" || Array.isArray(body.args)) {
      return json({ error: "Unsupported All-Time entry action." }, 400)
    }

    const result = await authorization.supabase.rpc(RPC_NAMES[body.action], body.args)
    if (result.error) return json({ error: result.error.message }, 400)
    return json({ data: result.data })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "All-Time entry action failed." }, 400)
  }
}
