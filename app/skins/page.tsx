import { ArtworkNavigation } from "@/components/navigation/ArtworkNavigation"
import { skinsArtwork } from "@/lib/artworkPageMaps"

export default function SkinsPage() {
  return <ArtworkNavigation definition={skinsArtwork} />
}
