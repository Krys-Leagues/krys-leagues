import { ArtworkNavigation } from "@/components/navigation/ArtworkNavigation"
import { pypArtwork } from "@/lib/artworkPageMaps"

export default function PYPPage() {
  return <ArtworkNavigation definition={pypArtwork} />
}
