import { ArtworkNavigation } from "@/components/navigation/ArtworkNavigation"
import { PublicPypBoard } from "@/components/publicLeague/PublicPypBoard"
import { pypArtwork } from "@/lib/artworkPageMaps"

export default function PYPPage() {
  return <><ArtworkNavigation definition={pypArtwork} /><PublicPypBoard /></>
}
