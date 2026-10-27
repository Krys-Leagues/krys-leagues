import sharp from "sharp"

export type KwtTrophyPlacement = {
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  color: string
  align: "left" | "center" | "right"
  fontFamily: "Arial" | "Georgia" | "Verdana" | "Trebuchet MS"
}

export const DEFAULT_KWT_TROPHY_PLACEMENT: KwtTrophyPlacement = {
  x: 50, y: 80, width: 76, height: 18, fontSize: 42, color: "#ffffff", align: "center", fontFamily: "Arial",
}

const HEX_COLOR = /^#[0-9a-f]{3,8}$/i
const FONTS = new Set<KwtTrophyPlacement["fontFamily"]>(["Arial", "Georgia", "Verdana", "Trebuchet MS"])

export function normalizeKwtTrophyPlacement(value: Partial<KwtTrophyPlacement>): KwtTrophyPlacement {
  const placement = { ...DEFAULT_KWT_TROPHY_PLACEMENT, ...value }
  if (![placement.x, placement.y, placement.width, placement.height, placement.fontSize].every(Number.isFinite)) throw new Error("Trophy name placement is invalid")
  if (placement.x < 0 || placement.x > 100 || placement.y < 0 || placement.y > 100 || placement.width <= 0 || placement.width > 100 || placement.height <= 0 || placement.height > 100) throw new Error("Trophy name placement must stay within the image")
  if (placement.fontSize < 8 || placement.fontSize > 512) throw new Error("Trophy text size must be between 8 and 512 pixels")
  if (!HEX_COLOR.test(placement.color) || !["left", "center", "right"].includes(placement.align) || !FONTS.has(placement.fontFamily)) throw new Error("Trophy name styling is invalid")
  return { ...placement, fontSize: Math.round(placement.fontSize) }
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" })[character] || character)
}

export async function inspectPng(bytes: Uint8Array) {
  const metadata = await sharp(bytes).metadata()
  if (metadata.format !== "png" || !metadata.width || !metadata.height) throw new Error("KWT trophy templates must be valid PNG images")
  return { width: metadata.width, height: metadata.height }
}

/** Renders a new PNG copy. The textLength constraint keeps long canonical names inside the saved nameplate. */
export async function renderKwtPersonalizedTrophy(originalBytes: Uint8Array, winnerName: string, value: Partial<KwtTrophyPlacement>) {
  const placement = normalizeKwtTrophyPlacement(value)
  const cleanName = winnerName.trim()
  if (!cleanName) throw new Error("A verified canonical player name is required")
  const { width, height } = await inspectPng(originalBytes)
  const boxWidth = Math.max(1, Math.round(width * placement.width / 100))
  const boxHeight = Math.max(1, Math.round(height * placement.height / 100))
  const boxX = Math.round(width * placement.x / 100 - boxWidth / 2)
  const boxY = Math.round(height * placement.y / 100 - boxHeight / 2)
  const textX = placement.align === "left" ? boxX : placement.align === "right" ? boxX + boxWidth : boxX + boxWidth / 2
  const anchor = placement.align === "left" ? "start" : placement.align === "right" ? "end" : "middle"
  const textY = boxY + boxHeight / 2 + placement.fontSize * 0.35
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><text x="${textX}" y="${textY}" text-anchor="${anchor}" fill="${placement.color}" font-family="${escapeXml(placement.fontFamily)}, sans-serif" font-size="${placement.fontSize}" font-weight="700" textLength="${boxWidth}" lengthAdjust="spacingAndGlyphs">${escapeXml(cleanName)}</text></svg>`
  const bytes = await sharp(originalBytes).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).png().toBuffer()
  return { bytes, placement, winnerName: cleanName, width, height }
}
