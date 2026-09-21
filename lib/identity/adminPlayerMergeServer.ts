import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export const PLAYER_AVATAR_BUCKET = "player-avatars"

export type AvatarCandidate = { player_id: string; screen_name: string; avatar_path: string }

export function createAdminIdentityClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Admin identity access is not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function previewAvatarMerge(client: SupabaseClient, keepPlayerId: string, mergePlayerIds: string[]) {
  const result = await client.rpc("preview_site_player_avatar_merge", {
    p_keep_player_id: keepPlayerId,
    p_merge_player_ids: mergePlayerIds,
  })
  if (result.error) throw result.error
  return Array.isArray(result.data) ? result.data[0] : result.data
}

function avatarExtension(path: string) {
  const extension = path.split(".").at(-1)?.toLowerCase()
  if (!extension || !["png", "jpg", "jpeg", "webp"].includes(extension)) {
    throw new Error("The selected avatar does not have a supported image extension")
  }
  return extension
}

export async function prepareCanonicalAvatarForMerge(
  client: SupabaseClient,
  keepPlayerId: string,
  candidates: AvatarCandidate[],
  selectedAvatarPath?: string,
) {
  const uniquePaths = [...new Set(candidates.map((candidate) => candidate.avatar_path).filter(Boolean))]
  if (uniquePaths.length === 0) return { sourceAvatarPath: null, canonicalAvatarPath: null, oldAvatarPaths: [] as string[] }

  const sourceAvatarPath = selectedAvatarPath || (uniquePaths.length === 1 ? uniquePaths[0] : "")
  if (!sourceAvatarPath || !uniquePaths.includes(sourceAvatarPath)) {
    throw new Error("Choose the reviewed avatar that should belong to the KEEP player")
  }

  if (sourceAvatarPath.startsWith(`${keepPlayerId}/`)) {
    return { sourceAvatarPath, canonicalAvatarPath: sourceAvatarPath, oldAvatarPaths: uniquePaths.filter((path) => path !== sourceAvatarPath) }
  }

  const canonicalAvatarPath = `${keepPlayerId}/avatar-${Date.now()}.${avatarExtension(sourceAvatarPath)}`
  const { error } = await client.storage.from(PLAYER_AVATAR_BUCKET).copy(sourceAvatarPath, canonicalAvatarPath)
  if (error) throw new Error(`Avatar preservation failed: ${error.message}`)
  return { sourceAvatarPath, canonicalAvatarPath, oldAvatarPaths: uniquePaths }
}

export async function removeOldPlayerAvatarObjects(client: SupabaseClient, paths: string[]) {
  const uniquePaths = [...new Set(paths.filter(Boolean))]
  if (uniquePaths.length === 0) return null
  const { error } = await client.storage.from(PLAYER_AVATAR_BUCKET).remove(uniquePaths)
  return error ? error.message : null
}
