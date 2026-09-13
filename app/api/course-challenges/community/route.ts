import { getPublicCourseChallenges } from "@/lib/courseChallenges/catalog"
import { aceRewardDefinition, aceStageRewardDefinitions, levelRewardDefinitions } from "@/lib/courseChallenges/rewards"
import { playerAvatarPublicUrl } from "@/lib/playerAvatars"
import { createServerSupabaseClient } from "@/lib/supabase/server"

type ProgressRow = { player_id: string; level_number: number; completed_at: string | null }
type RewardRow = { id: string; player_id: string; reward_key: string; label: string; course_slug: string; level: number | null; earned_at: string | null }

export async function GET(request: Request) {
  const courseSlug = new URL(request.url).searchParams.get("courseSlug") || ""
  const course = getPublicCourseChallenges().find((item) => item.slug === courseSlug)
  if (!course) return Response.json({ error: "Course not found." }, { status: 404 })
  try {
    const service = await createServerSupabaseClient()
    const progress = await service.from("course_challenge_progress").select("player_id,level_number,completed_at").eq("course_slug", course.slug).not("completed_at", "is", null)
    if (progress.error) throw progress.error
    const highest = new Map<string, number>()
    for (const row of (progress.data || []) as ProgressRow[]) highest.set(row.player_id, Math.max(highest.get(row.player_id) || 0, row.level_number))
    const rewards = await service.from("course_challenge_rewards").select("id,player_id,reward_key,label,course_slug,level,earned_at").eq("course_slug", course.slug)
    if (rewards.error) throw rewards.error
    const rewardRows = (rewards.data || []) as RewardRow[]
    const playerIds = [...new Set([...highest.keys(), ...rewardRows.map((row) => row.player_id)])]
    const players = playerIds.length ? await service.from("players").select("id,screen_name,avatar_path,status,active").in("id", playerIds) : { data: [], error: null }
    if (players.error) throw players.error
    const visiblePlayers = new Map((players.data || []).filter((player) => player.active !== false && !["retired", "merged", "archived"].includes(String(player.status || "").toLowerCase())).map((player) => [String(player.id), player]))
    const definitions = new Map([...course.levels.flatMap((level) => levelRewardDefinitions(course, level.level)), ...aceStageRewardDefinitions(course), ...(course.aceChallenge ? [aceRewardDefinition(course)] : [])].filter(Boolean).map((reward) => [reward!.rewardKey, reward!]))
    const player = (id: string) => { const row = visiblePlayers.get(id); const highestLevel = highest.get(id) || 0; const sticker = highestLevel ? definitions.get("course-challenge:" + course.slug + ":level-" + highestLevel + ":sticker") : null; return row ? { id, name: row.screen_name, avatarUrl: playerAvatarPublicUrl(row.avatar_path), highestLevel, levelStickerAsset: sticker?.assetPath || null, profileUrl: `/players/${encodeURIComponent(id)}` } : null }
    const levelGroups = [1, 2, 3, 4, 5].map((level) => ({ level, players: [...highest.entries()].filter(([, value]) => value === level).map(([id]) => player(id)).filter(Boolean) }))
    const specialGroups = ["course-pro", "ace-challenge", "course-master"].map((suffix) => ({ key: suffix, label: suffix === "course-pro" ? "Course Pro" : suffix === "ace-challenge" ? "Ace Challenge" : "Course Master", players: [...new Set(rewardRows.filter((row) => row.reward_key.endsWith(":" + suffix)).map((row) => row.player_id))].map((id) => ({ player: player(id), reward: definitions.get(rewardRows.find((row) => row.player_id === id && row.reward_key.endsWith(":" + suffix))?.reward_key || "") })).filter((entry) => entry.player) }))
    return Response.json({ course: { slug: course.slug, name: course.name }, levelGroups, specialGroups }, { headers: { "Cache-Control": "no-store" } })
  } catch (caught) {
    return Response.json({ error: caught instanceof Error ? caught.message : "Community progress is unavailable." }, { status: 503 })
  }
}
