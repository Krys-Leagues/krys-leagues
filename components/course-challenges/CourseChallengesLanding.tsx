"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"
import type { CourseChallengeCourse } from "@/lib/courseChallenges/types"
import styles from "./course-challenges.module.css"

const RULES_SEEN_KEY = "krys-leagues:course-challenges:rules-seen:v1"

export default function CourseChallengesLanding({ courses }: { courses: CourseChallengeCourse[] }) {
  const [showRules, setShowRules] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (window.localStorage.getItem(RULES_SEEN_KEY) !== "1") setShowRules(true)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  function dismissRules() {
    window.localStorage.setItem(RULES_SEEN_KEY, "1")
    setShowRules(false)
  }

  return <main className={styles.page}>
    <div className={styles.shell}>
      <Link href="/" className={styles.backLink}>← Krys Leagues</Link>
      <section className={styles.hero} aria-labelledby="course-challenges-title">
        <Image
          className={styles.heroImage}
          src="/course-challenges/course-challenges-welcome-approved.png"
          alt="Course Challenges welcome artwork"
          width={1600}
          height={900}
          priority
        />
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>PLAYER PROFILE · ACHIEVEMENT BOOK</p>
          <h1 id="course-challenges-title" className={styles.heading}>Course Challenges</h1>
          <p className={styles.intro}>Complete both sides of the same Level: one complete Easy scorecard and one complete Hard scorecard. Verified pairs unlock the next Level and its rewards.</p>
          <div className={styles.buttonRow}>
            <button type="button" className={styles.secondaryButton} onClick={() => setShowRules(true)}>Rules / Help</button>
          </div>
        </div>
        <div className={styles.courseList} aria-label="Launch courses">
          {courses.map((course) => <article className={styles.courseCard} key={course.slug}>
            <div className={styles.courseCardBackdrop} style={course.backgroundImage ? { backgroundImage: `url("${course.backgroundImage}")` } : undefined} aria-hidden="true" />
            <div className={styles.courseCardContent}>
              <div><p className={styles.eyebrow}>LAUNCH COURSE</p><h2><Link href={`/course-challenges/${course.slug}`} className={styles.courseNameLink}>{course.name}</Link></h2><p>{course.shortDescription}</p></div>
              <Link href={`/course-challenges/${course.slug}`} className={`${styles.primaryButton} ${styles.courseCardLink}`}>Open {course.name} Book →</Link>
            </div>
          </article>)}
        </div>
      </section>
    </div>
    {showRules && <section className={styles.rulesOverlay} role="dialog" aria-modal="true" aria-labelledby="course-challenges-rules-title">
      <div className={styles.rulesCard}>
        <p className={styles.eyebrow}>BEFORE YOU START</p>
        <h2 id="course-challenges-rules-title">Course Challenge rules</h2>
        <ul>
          <li>Each Level requires one complete Easy Course card and one complete Hard Course card.</li>
          <li>Solo and Multiplayer Game Mode rounds are allowed. Practice Mode does not qualify.</li>
          <li>Each difficulty’s requirements must come from the same complete 18-hole scorecard.</li>
          <li>Your scorecard photo must show the round date and time.</li>
          <li>We ask for both the scorecard photo and your 18 hole scores so we can check your round right away. That helps unlock your next Level without making you wait for an admin, while keeping Course Challenge results accurate.</li>
        </ul>
        <p className={styles.helper}>If you do not see the date and time on your scorecard, tap the three dots in the bottom-right BEFORE taking your picture.</p>
        <button type="button" className={styles.primaryButton} onClick={dismissRules}>Got it</button>
      </div>
    </section>}
  </main>
}
