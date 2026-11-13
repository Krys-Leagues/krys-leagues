import LiveStudio from "@/components/liveScoring/LiveStudio"

export const metadata = { title: "Tournament Admin Leaderboard | Krys Leagues" }

export default async function ScoringStudioAdminLeaderboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <LiveStudio adminOnly adminView="leaderboard" instanceSlug={slug} />
}
