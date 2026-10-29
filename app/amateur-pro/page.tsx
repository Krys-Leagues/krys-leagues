import { ArtworkNavigation } from "@/components/navigation/ArtworkNavigation"
import { PublicLeagueBoard } from "@/components/publicLeague/PublicLeagueBoard"
import { amateurToProArtwork } from "@/lib/artworkPageMaps"
import styles from "./page.module.css"

export default function AmateurProPage() {
  return <div className={styles.page}><ArtworkNavigation definition={amateurToProArtwork} /><PublicLeagueBoard kind="pro" /></div>
}
