import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import {
  createAdminIdentityClient,
  prepareCanonicalAvatarForMerge,
  previewAvatarMerge,
  removeOldPlayerAvatarObjects,
  type AvatarCandidate,
} from "@/lib/identity/adminPlayerMergeServer"

export const runtime = "nodejs"

function requiredString(value: unknown, label: string) {
  const result = String(value || "").trim()
  if (!result) throw new Error(`${label} is required.`)
  return result
}

function requiredIds(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.some((id) => typeof id !== "string" || !id.trim())) {
    throw new Error("At least one player identity is required.")
  }
  return value.map((id) => id.trim())
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  try {
    const body = await request.json() as Record<string, unknown>
    const action = requiredString(body.action, "Action")
    const client = createAdminIdentityClient()

    if (action === "duplicate_candidates") {
      const result = await client.rpc("get_site_player_duplicate_candidates")
      if (result.error) throw result.error
      return NextResponse.json({ data: result.data }, { headers: { "Cache-Control": "no-store" } })
    }

    const keepPlayerId = requiredString(body.keepPlayerId, "KEEP player")
    const mergePlayerIds = requiredIds(body.mergePlayerIds)
    if (mergePlayerIds.includes(keepPlayerId)) throw new Error("The KEEP player cannot also be merged.")

    if (action === "preview") {
      const [identity, avatar] = await Promise.all([
        client.rpc("preview_site_player_identity_merge", { p_keep_player_id: keepPlayerId, p_merge_player_ids: mergePlayerIds }),
        previewAvatarMerge(client, keepPlayerId, mergePlayerIds),
      ])
      if (identity.error) throw identity.error
      return NextResponse.json({ data: Array.isArray(identity.data) ? identity.data[0] : identity.data, avatar }, { headers: { "Cache-Control": "no-store" } })
    }

    if (action === "mark_different") {
      const result = await client.rpc("mark_site_players_not_match", { p_player_ids: [keepPlayerId, ...mergePlayerIds] })
      if (result.error) throw result.error
      return NextResponse.json({ data: result.data })
    }

    if (action === "merge") {
      const avatarPreview = await previewAvatarMerge(client, keepPlayerId, mergePlayerIds)
      const candidates = (avatarPreview?.avatar_candidates || []) as AvatarCandidate[]
      const prepared = await prepareCanonicalAvatarForMerge(client, keepPlayerId, candidates, typeof body.selectedAvatarPath === "string" ? body.selectedAvatarPath : undefined)
      const result = await client.rpc("merge_site_player_identities_with_avatar", {
        p_keep_player_id: keepPlayerId,
        p_merge_player_ids: mergePlayerIds,
        p_selected_avatar_path: prepared.sourceAvatarPath,
        p_canonical_avatar_path: prepared.canonicalAvatarPath,
      })
      if (result.error) throw result.error
      const cleanupError = await removeOldPlayerAvatarObjects(client, prepared.oldAvatarPaths)
      return NextResponse.json({ data: Array.isArray(result.data) ? result.data[0] : result.data, cleanupError })
    }

    return NextResponse.json({ error: "Unsupported player identity action." }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Player identity action failed." }, { status: 400 })
  }
}
