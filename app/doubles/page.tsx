import { ArtworkNavigation } from "@/components/navigation/ArtworkNavigation"
import { doublesArtwork } from "@/lib/artworkPageMaps"
import styles from "./page.module.css"

export default function DoublesPage() {
  return <div className={styles.page}><ArtworkNavigation definition={doublesArtwork} /></div>
}
