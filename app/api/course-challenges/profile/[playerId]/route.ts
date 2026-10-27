import { loadCourseChallengeProfile } from "@/lib/courseChallenges/profile"
import { createCourseChallengesServiceClient } from "@/lib/courseChallenges/server"

export async function GET(_request: Request, { params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params
  if (!playerId) return Response.json({ error: "Player is required." }, { status: 400 })
  try {
    const profile = await loadCourseChallengeProfile(createCourseChallengesServiceClient(), playerId)
    return Response.json(profile, { headers: { "Cache-Control": "no-store" } })
  } catch {
    // Public profiles should remain readable if the optional Course Challenge
    // tables have not been provisioned yet.
    return Response.json({ courses: [], rewards: [], completedLevels: [], selectedRewardKey: null, unavailable: true }, { headers: { "Cache-Control": "no-store" } })
  }
}
