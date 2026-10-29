import { ArtworkNavigation } from "@/components/navigation/ArtworkNavigation"
import { PublicLeagueBoard } from "@/components/publicLeague/PublicLeagueBoard"
import { skinsArtwork } from "@/lib/artworkPageMaps"

export default function SkinsPage() {
  return <><ArtworkNavigation definition={skinsArtwork} /><PublicLeagueBoard kind="skins" /></>
}
