import { ArtworkNavigation } from "@/components/navigation/ArtworkNavigation"
import { leaguePlayArtwork } from "@/lib/artworkPageMaps"

export default function LeaguePlayPage() {
  return <ArtworkNavigation definition={leaguePlayArtwork} />
}
