import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { loadAdminGlobalPlayerDirectory, loadAdminGlobalPlayers } from "@/lib/identity/adminGlobalPlayerLookup"

export const runtime = "nodejs"

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "no-store" },
})

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  try {
    const params = new URL(request.url).searchParams
    const search = params.get("q") ?? ""
    const players = params.get("details") === "identity"
      ? await loadAdminGlobalPlayerDirectory(search)
      : await loadAdminGlobalPlayers(search)
    return json({ players })
  } catch (error) {
    return json({
      players: [],
      error: error instanceof Error ? error.message : "Global Players could not be loaded.",
    }, 503)
  }
}
