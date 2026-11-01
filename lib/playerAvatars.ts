import { supabase } from "@/lib/supabase"

export const PLAYER_AVATAR_BUCKET = "player-avatars"
export const PLAYER_AVATAR_MAX_BYTES = 5 * 1024 * 1024
export const PLAYER_AVATAR_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const

export function playerAvatarPublicUrl(path: string | null | undefined) {
  if (!path) return null
  if (/^(blob:|data:|https?:\/\/)/i.test(path)) return path
  return supabase.storage.from(PLAYER_AVATAR_BUCKET).getPublicUrl(path).data.publicUrl
}

export function playerAvatarInitials(screenName: string) {
  const parts = screenName.trim().split(/\s+/).filter(Boolean)
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)?.[0] || ""}` : parts[0]?.slice(0, 2) || "?").toUpperCase()
}

export async function validatePlayerAvatarFile(file: File) {
  if (!PLAYER_AVATAR_MIME_TYPES.includes(file.type as typeof PLAYER_AVATAR_MIME_TYPES[number])) {
    return "Choose a PNG, JPEG, or WEBP image."
  }
  if (file.size <= 0 || file.size > PLAYER_AVATAR_MAX_BYTES) {
    return "Avatar images must be no larger than 5 MB."
  }
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const png = bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value)
  const jpeg = bytes.length >= 3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255
  const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4))==="RIFF" && String.fromCharCode(...bytes.slice(8,12))==="WEBP"
  if ((file.type==="image/png"&&!png)||(file.type==="image/jpeg"&&!jpeg)||(file.type==="image/webp"&&!webp)) {
    return "The selected file contents do not match its image type."
  }
  return null
}

export function playerAvatarObjectPath(playerId: string, file: File) {
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"
  return `${playerId}/avatar-${Date.now()}.${extension}`
}

export type CanonicalPlayerAvatar = {
  canonicalPlayerId: string
  avatarPath: string | null
}

export type PlayerAvatarMergeCandidate = {
  player_id: string
  avatar_path: string
}

export async function getCanonicalPlayerAvatar(playerId: string): Promise<CanonicalPlayerAvatar> {
  const { data, error } = await supabase.rpc("get_public_player_avatar", {
    p_player_id: playerId,
  })
  if (error) throw new Error(error.message)

  const avatar = (Array.isArray(data) ? data[0] : data) as {
    canonical_player_id: string
    avatar_path: string | null
  } | null
  if (!avatar) throw new Error("Canonical player avatar could not be resolved")

  return {
    canonicalPlayerId: avatar.canonical_player_id,
    avatarPath: avatar.avatar_path,
  }
}

function avatarExtension(path: string) {
  const extension = path.split(".").at(-1)?.toLowerCase()
  if (!extension || !["png", "jpg", "jpeg", "webp"].includes(extension)) {
    throw new Error("The selected avatar does not have a supported image extension")
  }
  return extension
}

export async function prepareCanonicalAvatarForMerge({
  keepPlayerId,
  candidates,
  selectedAvatarPath,
}: {
  keepPlayerId: string
  candidates: PlayerAvatarMergeCandidate[]
  selectedAvatarPath?: string
}) {
  const uniquePaths = [...new Set(candidates.map((candidate) => candidate.avatar_path).filter(Boolean))]
  if (uniquePaths.length === 0) {
    return { sourceAvatarPath: null, canonicalAvatarPath: null, oldAvatarPaths: [] as string[] }
  }

  const sourceAvatarPath = selectedAvatarPath || (uniquePaths.length === 1 ? uniquePaths[0] : "")
  if (!sourceAvatarPath || !uniquePaths.includes(sourceAvatarPath)) {
    throw new Error("Choose the reviewed avatar that should belong to the KEEP player")
  }

  if (sourceAvatarPath.startsWith(`${keepPlayerId}/`)) {
    return {
      sourceAvatarPath,
      canonicalAvatarPath: sourceAvatarPath,
      oldAvatarPaths: uniquePaths.filter((path) => path !== sourceAvatarPath),
    }
  }

  const canonicalAvatarPath = `${keepPlayerId}/avatar-${Date.now()}.${avatarExtension(sourceAvatarPath)}`
  const { error } = await supabase.storage
    .from(PLAYER_AVATAR_BUCKET)
    .copy(sourceAvatarPath, canonicalAvatarPath)
  if (error) throw new Error(`Avatar preservation failed: ${error.message}`)

  return {
    sourceAvatarPath,
    canonicalAvatarPath,
    oldAvatarPaths: uniquePaths,
  }
}

export async function removeOldPlayerAvatarObjects(paths: string[]) {
  const uniquePaths = [...new Set(paths.filter(Boolean))]
  if (uniquePaths.length === 0) return null
  const { error } = await supabase.storage.from(PLAYER_AVATAR_BUCKET).remove(uniquePaths)
  return error ? error.message : null
}
