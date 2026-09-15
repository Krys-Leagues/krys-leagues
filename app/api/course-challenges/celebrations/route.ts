import { getPublicCourseChallenges } from "@/lib/courseChallenges/catalog"
import { celebrationRewardLabel, COURSE_CHALLENGE_REACTIONS, type CourseChallengeReaction } from "@/lib/courseChallenges/celebrations"
import { aceRewardDefinition, aceStageRewardDefinitions, levelRewardDefinitions, prestigeStageRewardDefinitions } from "@/lib/courseChallenges/rewards"
import { createCourseChallengesServiceClient, getCourseChallengeIdentity } from "@/lib/courseChallenges/server"
import { playerAvatarPublicUrl } from "@/lib/playerAvatars"
import { createServerSupabaseClient } from "@/lib/supabase/server"

type RewardRow = { id: string; player_id: string; reward_key: string; label: string; kind: string; course_slug: string; level: number | null; earned_at: string | null }

function dateRange(dateParam: string | null) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam || "") ? dateParam as string : new Date().toISOString().slice(0, 10)
  const start = new Date(`${date}T00:00:00.000Z`)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 1)
  return { date, start: start.toISOString(), end: end.toISOString() }
}

function rewardDefinitions() {
  return new Map(getPublicCourseChallenges().flatMap((course) => [
    ...course.levels.flatMap((level) => levelRewardDefinitions(course, level.level)),
    ...aceStageRewardDefinitions(course),
    ...(course.prestigeStages || []).flatMap((stage) => prestigeStageRewardDefinitions(course, stage.stage)),
    ...(course.aceChallenge ? [aceRewardDefinition(course)] : []),
  ].filter((reward): reward is NonNullable<typeof reward> => Boolean(reward)).map((reward) => [reward.rewardKey, reward])))
}

export async function GET(request: Request) {
  try {
    const service = createCourseChallengesServiceClient()
    const range = dateRange(new URL(request.url).searchParams.get("date"))
    const definitions = rewardDefinitions()
    const rewards = await service.from("course_challenge_rewards").select("id,player_id,reward_key,label,kind,course_slug,level,earned_at").gte("earned_at", range.start).lt("earned_at", range.end).order("earned_at", { ascending: false })
    if (rewards.error) throw rewards.error
    const rows = (rewards.data || []) as RewardRow[]
    const playerIds = [...new Set(rows.map((row) => row.player_id))]
    const players = playerIds.length ? await service.from("players").select("id,screen_name,avatar_path,status,active").in("id", playerIds) : { data: [], error: null }
    if (players.error) throw players.error
    const playerMap = new Map((players.data || []).filter((player) => player.active !== false && !["retired", "merged", "archived"].includes(String(player.status || "").toLowerCase())).map((player) => [String(player.id), player]))
    const visibleRows = rows.filter((row) => playerMap.has(row.player_id))
    const reactionRows = visibleRows.length ? await service.from("course_challenge_reward_reactions").select("reward_id,player_id,reaction").in("reward_id", visibleRows.map((row) => row.id)) : { data: [], error: null }
    const reactionsEnabled = !reactionRows.error
    const viewer = reactionsEnabled ? await getCourseChallengeIdentity().catch(() => null) : null
    const reactions = new Map<string, { counts: Record<string, number>; viewerReaction: string | null }>()
    for (const row of (reactionRows.data || []) as Array<{ reward_id: string; player_id: string; reaction: string }>) {
      const entry = reactions.get(row.reward_id) || { counts: {}, viewerReaction: null }
      entry.counts[row.reaction] = (entry.counts[row.reaction] || 0) + 1
      if (viewer?.playerId === row.player_id) entry.viewerReaction = row.reaction
      reactions.set(row.reward_id, entry)
    }
    const celebrations = visibleRows.map((row) => {
      const player = playerMap.get(row.player_id)
      const definition = definitions.get(row.reward_key)
      const reaction = reactions.get(row.id) || { counts: {}, viewerReaction: null }
      return {
        id: row.id,
        playerId: row.player_id,
        playerName: String(player?.screen_name || "Player"),
        avatarUrl: playerAvatarPublicUrl(player?.avatar_path),
        courseSlug: row.course_slug,
        courseName: getPublicCourseChallenges().find((course) => course.slug === row.course_slug)?.name || row.course_slug,
        rewardLabel: celebrationRewardLabel(row.label, row.level, row.reward_key),
        rewardAsset: definition?.assetPath || null,
        earnedAt: row.earned_at,
        reactions: reaction.counts,
        viewerReaction: reaction.viewerReaction,
        reactionsEnabled,
      }
    })
    return Response.json({ date: range.date, celebrations, reactionsEnabled }, { headers: { "Cache-Control": "no-store" } })
  } catch (caught) {
    return Response.json({ error: caught instanceof Error ? caught.message : "Course Challenge celebrations are unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}

async function getReward(id: string) {
  const service = await createServerSupabaseClient()
  const result = await service.from("course_challenge_rewards").select("id").eq("id", id).maybeSingle()
  if (result.error) throw result.error
  return result.data
}

export async function POST(request: Request) {
  try {
    const identity = await getCourseChallengeIdentity()
    if (!identity) return Response.json({ error: "Sign in with a Player Profile to react." }, { status: 401 })
    const body = await request.json() as { rewardId?: string; reaction?: CourseChallengeReaction }
    if (!body.rewardId || !body.reaction || !COURSE_CHALLENGE_REACTIONS.includes(body.reaction)) return Response.json({ error: "Choose a valid reaction." }, { status: 400 })
    if (!await getReward(body.rewardId)) return Response.json({ error: "Celebration not found." }, { status: 404 })
    const client = await createServerSupabaseClient()
    const result = await client.from("course_challenge_reward_reactions").upsert({ reward_id: body.rewardId, player_id: identity.playerId, reaction: body.reaction }, { onConflict: "reward_id,player_id" })
    if (result.error) throw result.error
    return Response.json({ ok: true })
  } catch (caught) {
    return Response.json({ error: caught instanceof Error ? caught.message : "Reaction could not be saved." }, { status: 503 })
  }
}

export async function DELETE(request: Request) {
  try {
    const identity = await getCourseChallengeIdentity()
    if (!identity) return Response.json({ error: "Sign in with a Player Profile to remove a reaction." }, { status: 401 })
    const rewardId = new URL(request.url).searchParams.get("rewardId")
    if (!rewardId) return Response.json({ error: "Celebration is required." }, { status: 400 })
    const client = await createServerSupabaseClient()
    const result = await client.from("course_challenge_reward_reactions").delete().eq("reward_id", rewardId).eq("player_id", identity.playerId)
    if (result.error) throw result.error
    return Response.json({ ok: true })
  } catch (caught) {
    return Response.json({ error: caught instanceof Error ? caught.message : "Reaction could not be removed." }, { status: 503 })
  }
}
