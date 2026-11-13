import LiveStudio from "@/components/liveScoring/LiveStudio"

export const metadata = { title: "Tournament Room Builder | Krys Leagues" }

export default async function ScoringStudioAdminRoomsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <LiveStudio adminOnly adminView="rooms" instanceSlug={slug} />
}
