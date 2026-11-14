import Image from "next/image"
import Link from "next/link"
import styles from "./page.module.css"

const panels = [
  { href: "/register?league=cups", title: "Registration", description: "Join the protected Bracket / Cup player list.", className: styles.registration },
  { href: "/tournaments/5-4-3-2-1", title: "Current Brackets", description: "Open the existing tournament bracket and match view.", className: styles.current },
  { href: "/invitationals", title: "Invitational Qualification", description: "Review Champion, Krys Cup, and Spicy Cup paths.", className: styles.invitationals },
  { href: "/champions?category=bracket&from=tournaments", title: "Past Tournament Winners", description: "View recorded bracket champions in the Hall of Champions.", className: styles.history },
] as const

export default function TournamentsPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Link href="/" className={styles.backLink}>← Krys Leagues</Link>
        <section className={styles.artworkFrame} aria-labelledby="bracket-tournaments-title">
          <Image
            src="/approved-pages/bracket-tournaments-approved.png"
            alt="Krys Leagues Bracket Tournaments with a trophy, waterfalls, and a glowing landscape"
            fill
            priority
            sizes="(max-width: 1682px) 100vw, 1682px"
            className={styles.artwork}
          />
          <h1 id="bracket-tournaments-title" className={styles.srOnly}>Krys Leagues Bracket Tournaments</h1>
        </section>
        <nav className={styles.panelGrid} aria-label="Bracket Tournaments navigation">
          {panels.map((panel) => (
            <Link key={panel.title} href={panel.href} className={`${styles.panel} ${panel.className}`}>
              <span className={styles.panelTitle}>{panel.title}</span>
              <span className={styles.panelDescription}>{panel.description}</span>
              <span className={styles.panelArrow} aria-hidden="true">→</span>
            </Link>
          ))}
        </nav>
      </div>
    </main>
  )
}
