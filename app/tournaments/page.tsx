import { ArtworkNavigation } from "@/components/navigation/ArtworkNavigation"
import { bracketTournamentsArtwork } from "@/lib/artworkPageMaps"
import { getPublicRegistrationArtworkState } from "@/lib/tournaments/registrationPresentation"
import BracketRegistrationOverlay from "./BracketRegistrationOverlay"
import TourThisArea from "@/components/tour/TourThisArea"
import { loadPublicTournamentOverview } from "@/lib/tournaments/public"
import PublicBracketDataSections from "./PublicBracketDataSections"
import InternalTournamentCards from "./InternalTournamentCards"

export const dynamic = "force-dynamic"

export default async function TournamentsPage() {
  const overview = await loadPublicTournamentOverview()
  const registrationState = getPublicRegistrationArtworkState(overview.open)
  const artwork = {
    ...bracketTournamentsArtwork,
    imageSrc: registrationState === "open"
      ? "/approved-pages/bracket-tournaments-registration-open-approved.png"
      : "/approved-pages/bracket-tournaments-registration-closed-approved.png",
    targets: bracketTournamentsArtwork.targets.map((target) => target.id === "open-registration"
      ? { ...target, href: overview.open[0] ? `/tournaments/${overview.open[0].slug}` : "/tournaments" }
      : target),
  }
  const hiddenTargetIds = [
    ...(overview.live.length === 0 ? ["live-bracket-preview"] : []),
    ...(overview.open.length === 0 ? ["open-registration"] : []),
  ]
  return <ArtworkNavigation definition={artwork} hiddenTargetIds={hiddenTargetIds} overlay={<BracketRegistrationOverlay live={overview.live} />} afterFrame={<><InternalTournamentCards tournaments={overview.open} /><PublicBracketDataSections overview={overview} /><TourThisArea tourId="tournaments" /></>} />
}
