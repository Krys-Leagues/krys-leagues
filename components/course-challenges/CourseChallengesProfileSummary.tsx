"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import type { CourseChallengeCourse, CourseChallengeProfileReward } from "@/lib/courseChallenges/types"
import styles from "./course-challenges.module.css"

type CourseSummary = { slug: string; name: string; completedLevels: number[]; stickers: CourseChallengeProfileReward[]; prestigeRewards: CourseChallengeProfileReward[] }
type Payload = { courses?: CourseSummary[]; error?: string; unavailable?: boolean }

export default function CourseChallengesProfileSummary({ playerId, courses }: { playerId: string; courses: CourseChallengeCourse[] }) {
  const [payload, setPayload] = useState<Payload>({ courses: [] })

  useEffect(() => {
    let active = true
    fetch("/api/course-challenges/profile/" + encodeURIComponent(playerId), { cache: "no-store" }).then((response) => response.json() as Promise<Payload>).then((next) => { if (active) setPayload(next) }).catch(() => undefined)
    return () => { active = false }
  }, [playerId])

  const summaries = new Map((payload.courses || []).map((course) => [course.slug, course]))
  return <section className={styles.profileSummary} aria-labelledby="course-challenges-profile-heading">
    <div><p className={styles.eyebrow}>ACHIEVEMENT BOOK</p><h2 id="course-challenges-profile-heading">Course Challenges</h2><p className={styles.helper}>Only earned Level stickers are shown here. Open a course for the full five-Level book and progress details.</p></div>
    {courses.map((course) => {
      const summary = summaries.get(course.slug)
      const stickers = summary?.stickers || []
      const prestigeRewards = summary?.prestigeRewards || []
      return <div className={styles.profileCourseRow} key={course.slug}>
        <div>
          <Link href={"/course-challenges/" + course.slug} className={styles.courseNameLink}><strong>{course.name}</strong></Link>
          {prestigeRewards.length ? <div className={styles.profileStickers}>{prestigeRewards.map((reward) => <span className={styles.profileSticker} key={reward.rewardKey}>{reward.label}</span>)}</div> : null}
        </div>
        {stickers.length ? <div className={styles.profileStickers}>{stickers.map((sticker) => <span className={styles.profileSticker} key={sticker.rewardKey}>{sticker.label}</span>)}</div> : null}
      </div>
    })}
    {payload.error && <p className={styles.notice}>{payload.error}</p>}
    {payload.unavailable && <p className={styles.helper}>Course Challenge progress will appear after the review tables are provisioned.</p>}
  </section>
}
