import { ArtworkNavigation } from "@/components/navigation/ArtworkNavigation"
import { bracketTournamentsArtwork } from "@/lib/artworkPageMaps"
import BracketRegistrationOverlay from "./BracketRegistrationOverlay"

export default function TournamentsPage() {
  return <ArtworkNavigation definition={bracketTournamentsArtwork} overlay={<BracketRegistrationOverlay />} />
}
