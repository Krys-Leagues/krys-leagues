import { ArtworkNavigation } from "@/components/navigation/ArtworkNavigation"
import { PublicLeagueBoard } from "@/components/publicLeague/PublicLeagueBoard"
import { strokeArtwork } from "@/lib/artworkPageMaps"
import styles from "./page.module.css"

export default function StrokePage() {
  return (
    <div className={styles.page}>
      <ArtworkNavigation definition={strokeArtwork} />
      <PublicLeagueBoard kind="stroke" />
    </div>
  )
}
