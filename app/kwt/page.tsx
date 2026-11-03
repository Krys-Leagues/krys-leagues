import Link from "next/link"
import { ArtworkNavigation } from "@/components/navigation/ArtworkNavigation"
import { kwtArtwork } from "@/lib/artworkPageMaps"

export default function KWTPage() {
  const artworkDefinition = {
    ...kwtArtwork,
    targets: kwtArtwork.targets.map((target) => {
      if (target.id === "current-tournament") return { ...target, href: "/kwt/current", external: false }
      if (target.id === "past-champions") return { ...target, href: "/kwt/champions", external: false }
      return target
    }),
  }

  return (
    <ArtworkNavigation
      definition={artworkDefinition}
      hiddenTargetIds={[]}
      overlay={<Link href="/" className="artwork-navigation__back-link" aria-label="Back to Krys Leagues">← Krys Leagues</Link>}
    />
  )
}
