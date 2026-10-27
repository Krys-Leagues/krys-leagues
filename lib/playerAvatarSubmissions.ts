export const PLAYER_AVATAR_SUBMISSION_BUCKET = "player-avatar-submissions"
export const PLAYER_AVATAR_SUBMISSION_MAX_BYTES = 5 * 1024 * 1024
export const PLAYER_AVATAR_SUBMISSION_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const

export type PlayerAvatarSubmissionStatus = "UPLOADING" | "PENDING" | "APPROVED" | "REJECTED"

export function isSupportedPlayerAvatar(contentType: string, byteLength: number) {
  return PLAYER_AVATAR_SUBMISSION_TYPES.includes(contentType.toLowerCase() as (typeof PLAYER_AVATAR_SUBMISSION_TYPES)[number]) &&
    Number.isInteger(byteLength) && byteLength > 0 && byteLength <= PLAYER_AVATAR_SUBMISSION_MAX_BYTES
}

export function hasSupportedPlayerAvatarSignature(contentType: string, bytes: Uint8Array) {
  const type = contentType.toLowerCase()
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (type === "image/png") return bytes.length >= 8 && bytes.slice(0, 8).every((byte, index) => byte === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index])
  if (type === "image/gif") return bytes.length >= 6 && new TextDecoder().decode(bytes.slice(0, 6)) === "GIF89a" || new TextDecoder().decode(bytes.slice(0, 6)) === "GIF87a"
  if (type === "image/webp") return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  return false
}

export function playerAvatarExtension(contentType: string) {
  const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[contentType.toLowerCase() as string]
  if (!extension) throw new Error("Unsupported avatar image type")
  return extension
}
