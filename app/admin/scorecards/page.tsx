import { AdminScorecardsClient, type ScorecardQueueItem } from "@/components/admin/scorecards/AdminScorecardsClient"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createScorecardServiceClient } from "@/lib/scorecards/server"

export default async function AdminScorecardsPage() {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return <main className="min-h-screen bg-[#06111e] p-8 text-white"><p>Admin authorization is required.</p></main>
  const queue = await createScorecardServiceClient().from("shared_scorecard_evidence")
    .select("id,review_status,submitted_at,original_filename,shared_scorecard_contexts(adapter_key,season_number,division_label,game_number,course_name_snapshot,difficulty)")
    .in("review_status", ["submitted", "under_review"])
    .order("submitted_at", { ascending: true }).limit(100)
  return <AdminScorecardsClient initialQueue={(queue.data || []) as unknown as ScorecardQueueItem[]} initialError={queue.error ? "The scorecard review queue is unavailable." : ""} />
}
