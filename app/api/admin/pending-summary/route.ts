import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createCourseChallengesServiceClient } from "@/lib/courseChallenges/server"

type MastersSummary = { rooms?: number; scores?: number; latestId?: string | null }

export async function GET() {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  try {
    const service = createCourseChallengesServiceClient()
    const [courseChallenges, event] = await Promise.all([
      service.from("course_challenge_submissions")
        .select("id,created_at", { count: "exact" })
        .in("status", ["pending", "needs_review"])
        .order("created_at", { ascending: false })
        .limit(1),
      authorization.supabase.from("major_events").select("id").eq("slug", "masters").maybeSingle(),
    ])
    if (courseChallenges.error) throw courseChallenges.error
    if (event.error) throw event.error

    const masters = event.data
      ? await authorization.supabase.rpc("get_major_scorecard_verification_summary", { p_major_event_id: event.data.id })
      : { data: { rooms: 0, scores: 0, latestId: null }, error: null }
    if (masters.error) throw masters.error
    const mastersSummary = (masters.data || {}) as MastersSummary

    return Response.json({
      courseChallenges: {
        count: courseChallenges.count || 0,
        latestId: courseChallenges.data?.[0]?.id || null,
      },
      masters: {
        rooms: Number(mastersSummary.rooms) || 0,
        scores: Number(mastersSummary.scores) || 0,
        latestId: mastersSummary.latestId || null,
      },
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (caught) {
    return Response.json({ error: caught instanceof Error ? caught.message : "Pending admin summaries are unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
