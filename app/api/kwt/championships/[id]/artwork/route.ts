import "server-only"

import { NextResponse } from "next/server"
import { trustedTournamentClient } from "@/lib/tournaments/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  try {
    const client = trustedTournamentClient()
    const page = await client.from("kwt_championship_pages").select("artwork_storage_path,status").eq("id", id).eq("status", "published").maybeSingle()
    if (page.error || !page.data?.artwork_storage_path) return new NextResponse("Not found", { status: 404 })
    const file = await client.storage.from("kwt-championship-media").download(page.data.artwork_storage_path)
    if (file.error) return new NextResponse("Not found", { status: 404 })
    const type = page.data.artwork_storage_path.endsWith(".jpg") ? "image/jpeg" : page.data.artwork_storage_path.endsWith(".webp") ? "image/webp" : "image/png"
    return new NextResponse(await file.data.arrayBuffer(), { headers: { "Content-Type": type, "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } })
  } catch {
    return new NextResponse("Not found", { status: 404 })
  }
}
