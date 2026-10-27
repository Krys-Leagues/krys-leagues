import { ArtworkNavigation } from "@/components/navigation/ArtworkNavigation"
import { leaguePlayArtwork } from "@/lib/artworkPageMaps"
import DoublesLiveScoring from "./DoublesLiveScoring"
import TourThisArea from "@/components/tour/TourThisArea"

export default function LeaguePlayPage() {
  return <><ArtworkNavigation definition={leaguePlayArtwork} afterFrame={<TourThisArea tourId="leaguePlay" />} /><DoublesLiveScoring /></>
}
