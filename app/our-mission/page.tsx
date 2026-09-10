import Link from "next/link"
import styles from "./page.module.css"

export default function OurMissionPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <nav className={styles.nav} aria-label="Our Mission navigation">
          <Link href="/" className={styles.navLink}>← Krys Leagues</Link>
          <Link href="/players" className={styles.navLink}>Player Profiles</Link>
          <Link href="/course-challenges" className={styles.navLink}>Course Challenges</Link>
        </nav>

        <article className={styles.card}>
          <p className={styles.eyebrow}>THE KRYS LEAGUES PROMISE</p>
          <h1>OUR MISSION</h1>

          <div className={styles.copy}>
            <p>Krys Leagues has always been about creating a place where every player belongs — from someone brand new to the game, to amateur players, experienced competitors, and the elite of the elite.</p>
            <p>Players should be able to compete at a level that feels fair for where their game is today, while still being part of the same community.</p>
            <p>A newer or amateur player should never feel like they can’t play alongside an elite player.</p>
            <p>That is why you’ll find ranks and skill-based competition throughout Krys Leagues. They give everyone a place to compete, improve, and challenge themselves without feeling like they have to be one of the best players in the game just to take part.</p>
            <p>If you get stuck, ask us.</p>
            <p>Reach out to an admin, ask another player, or ask for a little help. Nobody should feel like they have to figure everything out alone.</p>
            <p>Course Challenges are another part of that mission. The early Levels help newer players learn safer, more consistent ways to play a course, while the later Levels are designed to challenge even our strongest players.</p>
          </div>

          <p className={styles.callout}>RANKS SEPARATE THE COMPETITION — NOT THE PLAYERS.</p>
          <p className={styles.closing}>Play together. Compete at your level. Learn from each other. Keep improving.</p>
          <p className={styles.finalLine}>There should always be a place for you here.</p>
        </article>
      </div>
    </main>
  )
}