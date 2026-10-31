import { parseTrophyAsset } from "@/lib/trophies/trophyImport"
import { TROPHY_ASSET_URLS } from "@/lib/trophies/trophyAssetManifest"

export const dynamic = "force-static"

export async function GET() {
  try {
    const candidates = TROPHY_ASSET_URLS
      .map(parseTrophyAsset)
      .filter((candidate) => candidate !== null)
      .sort((a, b) => b.month.localeCompare(a.month) || a.division.localeCompare(b.division) || a.placement.localeCompare(b.placement))
    return Response.json({ candidates })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to scan trophy assets." }, { status: 500 })
  }
}
