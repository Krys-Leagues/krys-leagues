import { loadCourseChallengeProfile } from "@/lib/courseChallenges/profile"
import { createCourseChallengesServiceClient, getCourseChallengeIdentity } from "@/lib/courseChallenges/server"

export async function GET(request: Request) {
  try {
    const identity = await getCourseChallengeIdentity()
    if (!identity) return Response.json({ courses: [], rewards: [], completedLevels: [], selectedRewardKey: null }, { status: 401, headers: { "Cache-Control": "no-store" } })
    const courseSlug = new URL(request.url).searchParams.get("courseSlug") || undefined
    return Response.json(await loadCourseChallengeProfile(createCourseChallengesServiceClient(), identity.playerId, courseSlug), { headers: { "Cache-Control": "no-store" } })
  } catch (caught) {
    return Response.json({ error: caught instanceof Error ? caught.message : "Course Challenge progress is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}