import sharp from "sharp"

export type TrophyTextAlignment = "left" | "center" | "right"

export type TrophyPlacement = {
  x: number
  y: number
  fontSize: number
  color: string
  align?: TrophyTextAlignment
}

const HEX_COLOR = /^#[0-9a-f]{3,8}$/i

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&apos;",
  })[character] || character)
}

export function normalizeTrophyPlacement(placement: TrophyPlacement): Required<TrophyPlacement> {
  const align = placement.align || "center"
  if (!["left", "center", "right"].includes(align)) throw new Error("Trophy text alignment is invalid")
  if (![placement.x, placement.y, placement.fontSize].every(Number.isFinite)) throw new Error("Trophy text placement is invalid")
  if (placement.x < 0 || placement.x > 100 || placement.y < 0 || placement.y > 100) throw new Error("Trophy text position must be between 0 and 100 percent")
  if (placement.fontSize < 8 || placement.fontSize > 512) throw new Error("Trophy text size must be between 8 and 512 pixels")
  if (!HEX_COLOR.test(placement.color)) throw new Error("Trophy text color must be a hexadecimal color")
  return { x: placement.x, y: placement.y, fontSize: Math.round(placement.fontSize), color: placement.color, align }
}

export async function renderPersonalizedTrophy(originalBytes: Uint8Array, winnerName: string, placement: TrophyPlacement) {
  const normalized = normalizeTrophyPlacement(placement)
  const cleanWinnerName = winnerName.trim()
  if (!cleanWinnerName) throw new Error("A verified winner name is required")

  const source = sharp(originalBytes)
  const metadata = await source.metadata()
  if (!metadata.width || !metadata.height) throw new Error("The trophy image dimensions could not be read")
  const x = Math.round(metadata.width * (normalized.x / 100))
  const y = Math.round(metadata.height * (normalized.y / 100))
  const anchor = normalized.align === "left" ? "start" : normalized.align === "right" ? "end" : "middle"
  const svg = `<svg width="${metadata.width}" height="${metadata.height}" xmlns="http://www.w3.org/2000/svg"><text x="${x}" y="${y}" text-anchor="${anchor}" fill="${normalized.color}" font-family="Arial, sans-serif" font-size="${normalized.fontSize}" font-weight="700">${escapeXml(cleanWinnerName)}</text></svg>`
  return {
    bytes: await source.composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).png().toBuffer(),
    placement: normalized,
    winnerName: cleanWinnerName,
    width: metadata.width,
    height: metadata.height,
  }
}
