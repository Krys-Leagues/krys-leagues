import Link from "next/link"
import { PublicRecordsHero, PublicRecordsShell, publicRecordsStyles as styles, RecordsGlyph } from "@/components/records/PublicRecordsUI"

export default function PublicRecordsLandingPage() {
  return (
    <PublicRecordsShell>
      <nav className={styles.nav}>
        <Link href="/" className={styles.button}>← Krys Leagues</Link>
      </nav>
      <PublicRecordsHero
        title="Course Records"
        description="Explore the official Krys Leagues leaderboards for single-course and combined-map records."
      />
      <section className={`${styles.glass} ${styles.pad}`}>
        <div className={styles.landingGrid}>
          <Link href="/records/single" className={`${styles.glass} ${styles.landingCard}`}>
            <span className={styles.icon}><RecordsGlyph /></span>
            <h2 className={styles.cardTitle}>Single Course Records</h2>
            <p className={styles.copy}>Browse separate Easy and Hard course leaderboards.</p>
            <span className={styles.open}>Open Single Course Records →</span>
          </Link>
          <Link href="/records/combined" className={`${styles.glass} ${styles.landingCard}`}>
            <span className={styles.icon}><RecordsGlyph combined /></span>
            <h2 className={styles.cardTitle}>Combined Records</h2>
            <p className={styles.copy}>Combined scores from official KWT and Pro League events. Not open to individual submissions.</p>
            <span className={styles.open}>Open Combined Records →</span>
          </Link>
        </div>
      </section>
    </PublicRecordsShell>
  )
}
