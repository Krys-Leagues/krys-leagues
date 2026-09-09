import styles from "./course-challenges.module.css"

export default function CourseChallengesGuide({ includeScorecardHelp = false }: { includeScorecardHelp?: boolean }) {
  return <div className={styles.guide}>
    <section className={styles.guideSection}>
      <p className={styles.eyebrow}>YOUR NEXT COURSE ADVENTURE</p>
      <h2 id="course-challenges-intro-title">WELCOME TO KRYS LEAGUES COURSE CHALLENGES</h2>
      <p>Course Challenges are for every level of player.</p>
      <p>Each released course has 5 Levels, with challenges for both the Easy Course and Hard Course.</p>
      <p>If you are a beginner or newer to a course, the first few Levels are designed to help you learn it. Many of the early challenges reward safe, consistent play, helping you discover reliable ways around the course while building your skills and confidence.</p>
      <p>Experienced players may find some of the first Levels fairly easy — and that is okay. The challenges get tougher as you progress.</p>
      <p>The later Levels are designed to test even some of the best players in Krys Leagues.</p>
      <p>Whether you are learning a course, improving your game, chasing mastery, or trying to collect every reward, there is something here for you.</p>
      <p>Finish both the Easy and Hard side of a Level to earn that Level&apos;s reward and unlock the next challenge.</p>
      <p className={styles.challengeCallout}>WHO&apos;S UP FOR THE CHALLENGE?</p>
    </section>

    <section className={styles.guideSection}>
      <h3>HOW IT WORKS</h3>
      <ul className={styles.guideList}>
        <li>Every course has Levels 1 through 5.</li>
        <li>Each Level has an Easy Course side and a Hard Course side.</li>
        <li>Submit one Easy scorecard and one Hard scorecard for each Level.</li>
        <li>All requirements for one difficulty must come from the same 18-hole scorecard.</li>
        <li>Solo and Multiplayer Game Mode rounds qualify. Practice Mode does not qualify.</li>
        <li>Upload the scorecard and enter H1–H18. The website checks the Level requirements automatically.</li>
        <li>Verified Easy + verified Hard completes the Level, earns the reward, and unlocks the next Level.</li>
      </ul>
    </section>

    <section className={styles.guideSection}>
      <h3>NEED A LITTLE HELP?</h3>
      <p>Some challenges include optional hints you can choose to open. Use them if you want — or take on the challenge without them.</p>
    </section>

    <section className={styles.guideSection}>
      <h3>SHOW OFF WHAT YOU EARN</h3>
      <p>Show off what you earn: When you earn Course Pro, Ace Challenge, Level 5, or Course Master, you can use that reward on your Player Profile in place of your regular profile image.</p>
      <ol className={styles.rewardOrder}>
        <li><strong>Course Pro</strong> — Earned when you complete Level 3.</li>
        <li><strong>Ace Challenge</strong> — Becomes available after Level 3 as a separate challenge.</li>
        <li><strong>Level 5</strong> — The Level 5 reward is a major display reward.</li>
        <li><strong>Course Master</strong> — Earned when you complete Level 5.</li>
      </ol>
      <p className={styles.helper}>Only earned rewards can be selected for your Player Profile. Choosing a display reward never changes ownership.</p>
    </section>

    {includeScorecardHelp && <section className={styles.guideSection}>
      <h3>SCORECARD HELP</h3>
      <p>Make sure the scorecard numbers and final score are clearly readable. Upload the photo, then enter H1–H18; the website calculates the final score from the authoritative course pars.</p>
      <p><strong>Recommended:</strong> crop the photo so the scorecard fills the image. Cropping is optional.</p>
      <p>The scorecard should show the round date and time. If date/time or Solo/Multiplayer evidence is unclear, Admin Review can verify the proof. Do not enter date, time, or Game Mode manually.</p>
    </section>}
  </div>
}
