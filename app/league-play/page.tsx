import { ArtworkNavigation } from "@/components/navigation/ArtworkNavigation"
import { leaguePlayArtwork } from "@/lib/artworkPageMaps"
import DoublesLiveScoring from "./DoublesLiveScoring"

export default function LeaguePlayPage() {
  return <><ArtworkNavigation definition={leaguePlayArtwork} /><DoublesLiveScoring /></>
}
