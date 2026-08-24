import CompetitionImporter from "@/app/admin/import/competitions/CompetitionImporter"
import { MONTHLY_PUBLIC_URL } from "@/lib/externalCompetitionSites"
import { discoverMonthlyPublicHtml, validateMonthlySourceUrl, type MonthlyPublicDiscovery } from "@/lib/importer/monthlyPublicSource"

export default async function TournamentImportPage({ searchParams }: { searchParams: Promise<{ monthlySource?: string }> }) {
  let monthlyDiscovery: MonthlyPublicDiscovery | null = null
  let monthlyDiscoveryError = ""
  try {
    const requested = (await searchParams).monthlySource || MONTHLY_PUBLIC_URL
    const sourceUrl = validateMonthlySourceUrl(requested)
    const response = await fetch(sourceUrl, { cache: "no-store", headers: { Accept: "text/html" } })
    if (!response.ok) throw new Error(`Monthly source returned HTTP ${response.status}.`)
    monthlyDiscovery = discoverMonthlyPublicHtml(await response.text(), sourceUrl)
  } catch (cause) {
    monthlyDiscoveryError = cause instanceof Error ? cause.message : "Monthly source could not be fetched."
  }
  return <CompetitionImporter initialKind="tournament" allowKindSelection monthlyDiscovery={monthlyDiscovery} monthlyDiscoveryError={monthlyDiscoveryError} title="Tournament / Invitational Importer" description="Discover and preview historical Tournament, Invitational, or Monthly results without inferring missing event facts or writing competition history." />
}
