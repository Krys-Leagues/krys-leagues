import { ArtworkNavigation } from "@/components/navigation/ArtworkNavigation"
import { bracketTournamentsArtwork } from "@/lib/artworkPageMaps"
import { CURRENT_TOURNAMENTS, fetchTourneyBotPreview } from "@/lib/tourneyBot"
import LiveBracketPanel from "./LiveBracketPanel"

export const revalidate = 60

export default async function TournamentsPage() {
  const previews = await Promise.all(CURRENT_TOURNAMENTS.map(fetchTourneyBotPreview))
  return <ArtworkNavigation definition={bracketTournamentsArtwork} overlay={<LiveBracketPanel previews={previews} />} />
}
