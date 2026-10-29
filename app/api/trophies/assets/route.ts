import { readdir } from "node:fs/promises"
import path from "node:path"
import { parseTrophyAsset } from "@/lib/trophies/trophyImport"

export const dynamic = "force-static"

const TROPHY_ROOT = path.join(process.cwd(), "public", "league-media", "trophies")
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"])

async function collectImages(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const paths = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) return collectImages(absolute)
    return IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) ? [absolute] : []
  }))
  return paths.flat()
}

export async function GET() {
  try {
    const files = await collectImages(TROPHY_ROOT)
    const candidates = files
      .map((file) => "/" + path.relative(path.join(process.cwd(), "public"), file).split(path.sep).map(encodeURIComponent).join("/"))
      .map(parseTrophyAsset)
      .filter((candidate) => candidate !== null)
      .sort((a, b) => b.month.localeCompare(a.month) || a.division.localeCompare(b.division) || a.placement.localeCompare(b.placement))
    return Response.json({ candidates })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to scan trophy assets." }, { status: 500 })
  }
}
