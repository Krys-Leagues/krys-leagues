import { supabase } from "@/lib/supabase"

export const TROPHY_IMAGE_BUCKET = "trophy-images"
export const TROPHY_IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const TROPHY_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const

export async function validateTrophyImageFile(file: File) {
  if (!TROPHY_IMAGE_MIME_TYPES.includes(file.type as typeof TROPHY_IMAGE_MIME_TYPES[number])) return "Choose a PNG, JPEG, or WEBP image."
  if (file.size <= 0 || file.size > TROPHY_IMAGE_MAX_BYTES) return "Trophy images must be no larger than 10 MB."
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const png = bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((value,index) => bytes[index] === value)
  const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP"
  if ((file.type === "image/png" && !png) || (file.type === "image/jpeg" && !jpeg) || (file.type === "image/webp" && !webp)) return "The selected file contents do not match its image type."
  return null
}

export async function trophyImageSha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function trophyImageObjectPath(playerId: string, file: File, digest: string) {
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"
  return `${playerId}/${digest}.${extension}`
}

export function trophyImagePublicUrl(path: string) {
  return supabase.storage.from(TROPHY_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl
}
