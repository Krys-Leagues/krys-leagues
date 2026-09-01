
import { ArtworkNavigation } from "@/components/navigation/ArtworkNavigation"
import { mainHubArtwork } from "@/lib/artworkPageMaps"

export default function HomePage() {
  return <ArtworkNavigation definition={mainHubArtwork} />
}
