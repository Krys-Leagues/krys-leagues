import { createCourseChallengesServiceClient, getCourseChallengeIdentity } from "@/lib/courseChallenges/server"

export async function PUT(request: Request) {
  try {
    const identity = await getCourseChallengeIdentity()
    if (!identity) return Response.json({ error: "A canonical Krys Leagues player identity is required to choose an earned reward." }, { status: 401 })
    const body = await request.json() as { rewardKey?: string | null }
    const rewardKey = body.rewardKey?.trim() || null
    const service = createCourseChallengesServiceClient()
    if (rewardKey) {
      const reward = await service.from("course_challenge_rewards").select("reward_key").eq("player_id", identity.playerId).eq("reward_key", rewardKey).maybeSingle()
      if (reward.error) throw reward.error
      if (!reward.data) return Response.json({ error: "Only earned Course Challenge rewards can be selected." }, { status: 403 })
    }
    const result = await service.from("course_challenge_profile_selections").upsert({ player_id: identity.playerId, selected_reward_key: rewardKey, updated_at: new Date().toISOString() }, { onConflict: "player_id" })
    if (result.error) throw result.error
    return Response.json({ selectedRewardKey: rewardKey })
  } catch (caught) { return Response.json({ error: caught instanceof Error ? caught.message : "Reward selection could not be saved." }, { status: 503 }) }
}