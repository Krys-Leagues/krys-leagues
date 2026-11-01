import Link from "next/link"
import { ArtworkNavigation } from "@/components/navigation/ArtworkNavigation"
import { kwtArtwork } from "@/lib/artworkPageMaps"
import { KWT_NET_PUBLIC_DESTINATION } from "@/lib/kwtDestinations"
import styles from "./page.module.css"

type HubItem = { title: string; description: string; href?: string; external?: boolean; status?: string }

const localItems: HubItem[] = [
  { title: "Current Season", description: "Season 15 official Standard results and the active KWT week.", href: "/kwt/current" },
  { title: "Weekly Results", description: "Browse verified KWT scorecards by season, week, player, or course.", href: "/kwt/history" },
  { title: "Standard Leaderboards", description: "Official current-season standings grouped by KWT division.", href: "/kwt/current#standard-leaderboards" },
  { title: "Divisions", description: "Amateur, Semi-Pro, Pro, and Elite Standard results from the official current week.", href: "/kwt/current#divisions" },
  { title: "Previous Seasons", description: "Season history preserved from the canonical KWT scorecard source.", href: "/kwt/history" },
  { title: "Course Records", description: "Verified KWT course and combined records from the existing public reader.", href: "/kwt/records" },
  { title: "Upcoming Events", description: "Approved KWT calendar and weekly feature content only.", href: "/kwt/upcoming" },
  { title: "Championships, Trophies & Achievements", description: "Published stories and approved read-only awards from the shared KWT systems.", href: "/kwt/champions" },
]

function HubNavigation() {
  const netItem: HubItem = KWT_NET_PUBLIC_DESTINATION
    ? { title: "KWT NET", description: "Open the independently maintained NET system.", href: KWT_NET_PUBLIC_DESTINATION, external: true }
    : { title: "KWT NET", description: "Project 22 has not supplied an approved public destination yet.", status: "Destination pending" }

  const items = [...localItems.slice(0, 3), netItem, ...localItems.slice(3)]
  return <section className={styles.hubPanel} aria-labelledby="kwt-navigation-title">
    <div className={styles.panelHeading}>
      <p className={styles.eyebrow}>KWT · KRYS WEEKLY TOURNAMENT</p>
      <h2 id="kwt-navigation-title">Official KWT areas</h2>
      <p>Recovered player-facing sections stay connected to the existing KWT data and Global Players identity systems.</p>
    </div>
    <div className={styles.hubGrid}>{items.map((item) => item.href ? (
      item.external ? <a key={item.title} href={item.href} target="_blank" rel="noopener noreferrer" className={styles.hubCard}><span className={styles.hubCardTitle}>{item.title}</span><span className={styles.hubCardDescription}>{item.description}</span><span className={styles.hubCardAction}>Open area →</span></a>
        : <Link key={item.title} href={item.href} className={styles.hubCard}><span className={styles.hubCardTitle}>{item.title}</span><span className={styles.hubCardDescription}>{item.description}</span><span className={styles.hubCardAction}>Open area →</span></Link>
    ) : <div key={item.title} className={`${styles.hubCard} ${styles.hubCardDisabled}`} aria-disabled="true"><span className={styles.hubCardTitle}>{item.title}</span><span className={styles.hubCardDescription}>{item.description}</span><span className={styles.comingSoon}>{item.status}</span></div>)}</div>
  </section>
}

export default function KWTPage() {
  const netDestination = KWT_NET_PUBLIC_DESTINATION
  const artworkDefinition = netDestination
    ? {
      ...kwtArtwork,
      targets: kwtArtwork.targets.map((target) => target.id === "current-tournament"
        ? { ...target, href: netDestination, external: true }
        : target),
    }
    : kwtArtwork

  return (
    <ArtworkNavigation
      definition={artworkDefinition}
      hiddenTargetIds={netDestination ? [] : ["current-tournament"]}
      overlay={<Link href="/" className="artwork-navigation__back-link" aria-label="Back to Krys Leagues">← Krys Leagues</Link>}
      afterFrame={<HubNavigation />}
    />
  )
}
