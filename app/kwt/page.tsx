import Link from "next/link"
import { ArtworkNavigation } from "@/components/navigation/ArtworkNavigation"
import { kwtArtwork } from "@/lib/artworkPageMaps"

export default function KWTPage() {
  return (
    <ArtworkNavigation
      definition={kwtArtwork}
      overlay={
        <Link href="/" className="artwork-navigation__back-link" aria-label="Back to Krys Leagues">
          ← Krys Leagues
        </Link>
      }
    />
  )
}
