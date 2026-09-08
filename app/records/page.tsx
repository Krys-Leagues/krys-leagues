import { ArtworkNavigation } from "@/components/navigation/ArtworkNavigation"
import { overallLeaderboardsArtwork } from "@/lib/artworkPageMaps"

export default function PublicRecordsLandingPage() {
  return <ArtworkNavigation definition={overallLeaderboardsArtwork} />
}
