import { loadHandicapRows } from "@/lib/handicap/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const rows = await loadHandicapRows()
    return Response.json({ rows, source: "server-protected-handicap-reader" }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=120" } })
  } catch (error) {
    console.error("[handicaps-public] read failed", error)
    return Response.json({ rows: [], code: "handicap_unavailable", message: "Handicap ladder is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
