import { ArtworkNavigation } from "@/components/navigation/ArtworkNavigation"
import { kwtArtwork } from "@/lib/artworkPageMaps"

export default function KWTPage() {
  const artworkDefinition = {
    ...kwtArtwork,
    targets: kwtArtwork.targets.map((target) => {
      if (target.id === "past-champions") return { ...target, href: "/kwt/champions", external: false }
      return target
    }),
  }

  return (
    <ArtworkNavigation
      definition={artworkDefinition}
      hiddenTargetIds={[]}
      overlay={<a href="https://krysleagues.com/" className="artwork-navigation__back-link" aria-label="Back to Krys Leagues">← Krys Leagues</a>}
    />
  )
}
