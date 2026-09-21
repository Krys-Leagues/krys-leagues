import { createClient } from "@supabase/supabase-js"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

export const runtime = "nodejs"
const bucket = "player-avatars"

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Admin player access is not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function errorResponse(error: unknown, status = 400) {
  return Response.json({ error: error instanceof Error ? error.message : "Player profile request failed." }, { status, headers: { "Cache-Control": "no-store" } })
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  try {
    const { id } = await context.params
    const client = createAdminClient()
    const identity = await client.rpc("get_public_player_canonical_identity", { p_player_id: id })
    if (identity.error) throw identity.error
    const identityRow = (Array.isArray(identity.data) ? identity.data[0] : identity.data) as { canonical_player_id?: string; canonical_screen_name?: string; aliases?: string[]; is_server_booster?: boolean; has_krys_server_tag?: boolean; profile_badges?: string[] } | null
    const canonicalId = identityRow?.canonical_player_id || id
    const [player, avatar, memberships, trophies, results] = await Promise.all([
      client.from("players").select("id, screen_name, discord_id, discord_name, discord_username, status, active").eq("id", canonicalId).single(),
      client.rpc("get_public_player_avatar", { p_player_id: canonicalId }),
      client.from("player_league_memberships").select("id, league_type, season_number, division").eq("player_id", id).order("season_number", { ascending: false }),
      client.from("player_trophies").select("*").eq("player_id", id).order("created_at", { ascending: false }),
      client.from("results").select("id, player1_id, player2_id, winner, is_draw").or(`player1_id.eq.${id},player2_id.eq.${id}`),
    ])
    const queryError = player.error || avatar.error || memberships.error || trophies.error || results.error
    if (queryError) throw queryError
    const playerRow = player.data
    const resultRows = results.data || []
    const draws = resultRows.filter((row) => row.is_draw).length
    const wins = resultRows.filter((row) => playerRow?.screen_name && row.winner === playerRow.screen_name).length
    const matchesPlayed = resultRows.length
    const avatarRow = (Array.isArray(avatar.data) ? avatar.data[0] : avatar.data) as { avatar_path?: string | null } | null
    return Response.json({
      player: playerRow,
      identity: identityRow,
      avatarPath: avatarRow?.avatar_path || null,
      memberships: memberships.data || [],
      trophies: trophies.data || [],
      careerStats: { matchesPlayed, wins, losses: matchesPlayed - wins - draws, draws, winPercent: matchesPlayed ? `${Math.round((wins / matchesPlayed) * 100)}%` : "0%" },
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return errorResponse(error, 503)
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  try {
    const { id } = await context.params
    const form = await request.formData()
    const action = String(form.get("action") || "")
    const client = createAdminClient()
    if (action === "remove_avatar") {
      const current = await client.rpc("get_public_player_avatar", { p_player_id: id })
      if (current.error) throw current.error
      const row = (Array.isArray(current.data) ? current.data[0] : current.data) as { avatar_path?: string | null } | null
      const result = await client.rpc("set_site_player_avatar_path", { p_player_id: id, p_avatar_path: null })
      if (result.error) throw result.error
      if (row?.avatar_path) await client.storage.from(bucket).remove([row.avatar_path])
      return Response.json({ ok: true, avatarPath: null })
    }
    if (action !== "save_avatar") return errorResponse(new Error("Unsupported player profile action."), 400)
    const file = form.get("avatar")
    if (!(file instanceof File) || file.size <= 0 || file.size > 5 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) return errorResponse(new Error("Choose a PNG, JPEG, or WEBP image no larger than 5 MB."), 400)
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"
    const nextPath = `${id}/avatar-${Date.now()}.${extension}`
    const upload = await client.storage.from(bucket).upload(nextPath, file, { contentType: file.type, upsert: false })
    if (upload.error) throw upload.error
    const current = await client.rpc("get_public_player_avatar", { p_player_id: id })
    if (current.error) throw current.error
    const oldRow = (Array.isArray(current.data) ? current.data[0] : current.data) as { avatar_path?: string | null } | null
    const result = await client.rpc("set_site_player_avatar_path", { p_player_id: id, p_avatar_path: nextPath })
    if (result.error) {
      await client.storage.from(bucket).remove([nextPath])
      throw result.error
    }
    if (oldRow?.avatar_path && oldRow.avatar_path !== nextPath) await client.storage.from(bucket).remove([oldRow.avatar_path])
    return Response.json({ ok: true, avatarPath: nextPath })
  } catch (error) {
    return errorResponse(error, 503)
  }
}
