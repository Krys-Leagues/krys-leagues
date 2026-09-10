"use client"

import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import type { CourseChallengeCourse } from "@/lib/courseChallenges/types"
import CourseChallengesGuide from "./CourseChallengesGuide"
import styles from "./course-challenges.module.css"

const INTRO_STORAGE_KEY = "course-challenges-intro-dismissed-v1"

export default function CourseChallengesLanding({ courses }: { courses: CourseChallengeCourse[] }) {
  const [showIntro, setShowIntro] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [profileMessage, setProfileMessage] = useState("")
  const router = useRouter()

  useEffect(() => {
    try {
      // Client storage is intentionally read after hydration so the server and client markup stay stable.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowIntro(window.localStorage.getItem(INTRO_STORAGE_KEY) !== "dismissed")
    } catch {
      setShowIntro(true)
    }
  }, [])

  function dismissIntro() {
    try {
      window.localStorage.setItem(INTRO_STORAGE_KEY, "dismissed")
    } catch {
      // The guide remains available from Rules / Help if browser storage is unavailable.
    }
    setShowIntro(false)
  }

  async function openOwnProfile() {
    setProfileMessage("")
    const { data: canonicalId, error } = await supabase.rpc("current_user_canonical_player_id")
    if (error || typeof canonicalId !== "string" || !canonicalId) {
      setProfileMessage("Your canonical player profile could not be resolved. Use Player Profiles to browse safely.")
      return
    }
    router.push("/players/" + encodeURIComponent(canonicalId))
  }

  return <main className={styles.page}>
    <div className={styles.shell}>
      <div className={styles.backLinks}>
        <Link href="/" className={styles.backLink}>← Krys Leagues</Link>
        <Link href="/our-mission" className={styles.backLink}>Our Mission</Link>
        <button type="button" className={styles.backLinkButton} onClick={() => void openOwnProfile()}>← Player Profile</button>
      </div>
      {profileMessage && <p className={styles.notice} role="alert">{profileMessage}</p>}
      <h1 id="course-challenges-title" className="sr-only">Course Challenges</h1>
      <Image
        className={styles.heroImage}
        src="/course-challenges/course-challenges-welcome-approved.png"
        alt="Course Challenges welcome artwork"
        width={1600}
        height={900}
        priority
      />
      <section className={styles.courseList} aria-label="Available Course Challenges">
        <h2 className="sr-only">Available courses</h2>
        {courses.map((course) => <article className={styles.courseCard} key={course.slug}>
          <div className={styles.courseCardBackdrop} style={course.backgroundImage ? { backgroundImage: `url("${course.backgroundImage}")` } : undefined} aria-hidden="true" />
          <div className={styles.courseCardContent}>
            <div><p className={styles.eyebrow}>LAUNCH COURSE</p><h2><Link href={`/course-challenges/${course.slug}`} className={styles.courseNameLink}>{course.name}</Link></h2><p>{course.shortDescription}</p></div>
            <Link href={`/course-challenges/${course.slug}`} className={`${styles.primaryButton} ${styles.courseCardLink}`}>Open {course.name} Book →</Link>
          </div>
        </article>)}
      </section>
      <div className={styles.buttonRow}>
        <button type="button" className={styles.secondaryButton} onClick={() => setShowRules(true)}>Rules / Help</button>
      </div>
    </div>
    {(showIntro || showRules) && <section className={styles.rulesOverlay} role="dialog" aria-modal="true" aria-labelledby="course-challenges-intro-title">
      <div className={styles.rulesCard}>
        <CourseChallengesGuide includeScorecardHelp={showRules} />
        <div className={styles.buttonRow}>
          <button type="button" className={styles.primaryButton} onClick={showIntro ? dismissIntro : () => setShowRules(false)}>{showIntro ? "Got it" : "Close"}</button>
        </div>
      </div>
    </section>}
  </main>
}
