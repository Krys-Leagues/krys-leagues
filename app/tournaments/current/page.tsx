import Link from "next/link"
import { loadPublicTournamentOverview } from "@/lib/tournaments/public"
import InternalTournamentCards from "../InternalTournamentCards"
import LiveBracketPreview from "./LiveBracketPreview"
import styles from "./page.module.css"

export const dynamic = "force-dynamic"

export default async function CurrentBracketsPage() {
  const overview = await loadPublicTournamentOverview()
  return <main className={styles.page}><div className={styles.shell}><Link href="/tournaments" className={styles.back}>← Bracket Tournaments</Link><header className={styles.header}><p className={styles.eyebrow}>Krys Leagues public brackets</p><h1>Current Brackets</h1><p>Live public tournament brackets published by Lynne&apos;s Tournament Builder.</p></header><InternalTournamentCards tournaments={overview.open} />{overview.live.length > 0 ? <section id="live-preview" className={styles.previewSection} aria-labelledby="live-preview-title"><h2 id="live-preview-title">Live Bracket Preview</h2><p>Only complete, published website-managed brackets appear here.</p><LiveBracketPreview tournaments={overview.live} /></section> : <p className={styles.empty}>No live website-managed bracket is currently published.</p>}</div></main>
}
