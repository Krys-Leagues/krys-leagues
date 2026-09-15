import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { loadAdminGlobalPlayerDirectory } from "@/lib/identity/adminGlobalPlayerLookup"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  try {
    return NextResponse.json({ players: await loadAdminGlobalPlayerDirectory() }, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    return NextResponse.json({
      players: [],
      error: error instanceof Error ? error.message : "Global Player identity data could not be loaded.",
    }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
