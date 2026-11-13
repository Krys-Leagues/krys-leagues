import LiveStudio from "@/components/liveScoring/LiveStudio"

export const metadata = { title: "Tournament Scoring Admin | Krys Leagues" }

export default async function ScoringStudioTournamentAdminPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <LiveStudio adminOnly instanceSlug={slug} />
}
