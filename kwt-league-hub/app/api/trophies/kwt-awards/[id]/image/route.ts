import "server-only"

import { NextResponse } from "next/server"
import { trustedTournamentClient } from "@/lib/tournaments/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!id) return new NextResponse("Not found", { status: 404 })
  try {
    const client = trustedTournamentClient()
    const award = await client.from("kwt_trophy_awards").select("personalized_storage_path,status").eq("id", id).maybeSingle()
    if (award.error || !award.data || !["approved", "awarded"].includes(award.data.status) || !award.data.personalized_storage_path) return new NextResponse("Not found", { status: 404 })
    const file = await client.storage.from("tournament-trophies").download(award.data.personalized_storage_path)
    if (file.error) return new NextResponse("Not found", { status: 404 })
    return new NextResponse(await file.data.arrayBuffer(), { status: 200, headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } })
  } catch {
    return new NextResponse("Not found", { status: 404 })
  }
}
