import { notFound } from "next/navigation"
import LiveStudio from "@/components/liveScoring/LiveStudio"

const SYNTHETIC_STAGING_SLUG = "mga-staging-synthetic-final-test"

export const dynamic = "force-dynamic"

export default async function SyntheticStagingScoringStudioPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.KRYS_DEPLOY_TARGET !== "staging" ||
    slug !== SYNTHETIC_STAGING_SLUG
  ) {
    notFound()
  }

  return <LiveStudio instanceSlug={SYNTHETIC_STAGING_SLUG} />
}
