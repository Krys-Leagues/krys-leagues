import Image from "next/image"
import Link from "next/link"
import styles from "./page.module.css"

export default function KWTPage() {
  return (
    <main className={styles.page} data-approved-artwork-page="kwt-hub">
      <h1 className="sr-only">KWT · Krys Weekly Tournament</h1>
      <div className={styles.frame}>
        <Image
          className={styles.artwork}
          src="/approved-pages/kwt-hub-approved.jpg"
          alt="KWT Krys Weekly Tournament hub with Current Tournament, Upcoming Events, Past Champions, and Records cards"
          fill
          priority
          sizes="(max-width: 1150px) 100vw, 1150px"
          draggable={false}
        />

        <Link href="/" className={styles.backLink}>
          <span aria-hidden="true">←</span> Krys Leagues
        </Link>

        <nav className={styles.targets} aria-label="KWT navigation">
          <Link href="/champions?league=kwt" className={`${styles.target} ${styles.pastChampions}`}>
            <span className="sr-only">Past Champions</span>
          </Link>
          <Link href="/records" className={`${styles.target} ${styles.records}`}>
            <span className="sr-only">Records</span>
          </Link>
        </nav>
      </div>
    </main>
  )
}
