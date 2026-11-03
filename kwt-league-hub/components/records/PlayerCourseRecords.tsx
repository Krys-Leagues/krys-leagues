"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import styles from "./PublicRecordsUI.module.css"
import { personalCombinedFallbackKey } from "@/lib/all-time/public-records"

type Category = "Easy" | "Hard"
type DisplayRow = { key: string; rank: number | null; course: string; score: number }
type CategoryState = { rows: DisplayRow[]; loading: boolean; error: string }
type CombinedDisplayRow = { key: string; rank: number | null; course: string; easyScore: number; hardScore: number; totalScore: number }
type CombinedState = { rows: CombinedDisplayRow[]; loading: boolean; error: string }

const CATEGORIES: Category[] = ["Easy", "Hard"]
const EMPTY_STATE: Record<Category, CategoryState> = {
  Easy: { rows: [], loading: true, error: "" },
  Hard: { rows: [], loading: true, error: "" },
}
const EMPTY_COMBINED: CombinedState = { rows: [], loading: true, error: "" }

function RankMark({ rank, fallback }: { rank: number | null; fallback?: boolean }) {
  return <span className={`${styles.profileRankNumber}${fallback ? ` ${styles.profileFallbackRank}` : ""}`}>{rank === null ? "—" : `#${rank}`}</span>
}

export default function PlayerCourseRecords({ playerId }: { playerId: string }) {
  const [categories, setCategories] = useState<Record<Category, CategoryState>>(EMPTY_STATE)
  const [combined, setCombined] = useState<CombinedState>(EMPTY_COMBINED)

  useEffect(() => {
    let cancelled = false
    const loadCategory = async (category: Category) => {
      try {
        const response = await fetch(`/api/records/public?view=profile&playerId=${encodeURIComponent(playerId)}&category=${encodeURIComponent(category)}`)
        const payload = await response.json() as { rows?: DisplayRow[]; error?: string }
        if (!response.ok) throw new Error(payload.error)
        return [category, { rows: payload.rows ?? [], loading: false, error: "" }] as const
      } catch (caught) {
        return [category, { rows: [], loading: false, error: caught instanceof Error ? caught.message : `${category} records could not be loaded.` }] as const
      }
    }
    const loadCombined = async (): Promise<CombinedState> => {
      try {
        const response = await fetch(`/api/records/public?view=profile&playerId=${encodeURIComponent(playerId)}&category=Combined`)
        const payload = await response.json() as { rows?: CombinedDisplayRow[]; error?: string }
        if (!response.ok) throw new Error(payload.error)
        return { rows: payload.rows ?? [], loading: false, error: "" }
      } catch (caught) {
        return { rows: [], loading: false, error: caught instanceof Error ? caught.message : "Combined records could not be loaded." }
      }
    }
    void Promise.all([Promise.all(CATEGORIES.map(loadCategory)), loadCombined()]).then(([results, combinedState]) => {
      if (!cancelled) {
        setCategories(Object.fromEntries(results) as Record<Category, CategoryState>)
        setCombined(combinedState)
      }
    })
    return () => { cancelled = true }
  }, [playerId])

  const bestFallbackKey = personalCombinedFallbackKey(combined.rows)

  return <section className={styles.profilePanel} aria-label="Krys Leagues All-Time Records">
    <header className={styles.profileShowcaseHeader}>
      <div>
        <p className={styles.profileEyebrow}>Player showcase</p>
        <h2 className={styles.profileHeading}>All-Time Records</h2>
        <p className={styles.profileIntro}>Current personal standings across individual and combined-map records.</p>
      </div>
      <Link className={styles.profileLink} href="/records">View full leaderboards →</Link>
    </header>

    <h3 className={styles.profileSubheading}>Course leaderboards</h3>
    <div className={styles.profileRecordsGrid}>
      {CATEGORIES.map((category) => {
        const state = categories[category]
        const categoryKey = category.replace(" ", "")
        return <section className={styles.profileCategory} key={category} aria-labelledby={`profile-records-${categoryKey.toLowerCase()}`}>
          <h3 id={`profile-records-${categoryKey.toLowerCase()}`} className={styles.profileCategoryTitle}>{category}</h3>
          <div className={styles.profileCategoryRows}>
            {state.loading ? <div className={styles.profileEmpty}>Loading…</div> : state.error ? <div className={styles.profileEmpty}>{state.error}</div> : state.rows.length ? state.rows.map((row) => {
              return <div className={styles.profileRecordRow} key={row.key}>
                <RankMark rank={row.rank} />
                <span className={styles.profileCourse} title={row.course}>{row.course}</span>
                <span className={`${styles.profileScore} ${category === "Easy" ? styles.easy : styles.hard}`}>{row.score}</span>
              </div>
            }) : <div className={styles.profileEmpty}>No {category} records yet.</div>}
          </div>
        </section>
      })}
    </div>
    <section className={styles.profileCombined} aria-labelledby="profile-combined-leaderboard">
      <div className={styles.profileCombinedHeader}>
        <div>
          <h3 id="profile-combined-leaderboard" className={styles.profileSubheading}>Combined leaderboard</h3>
          <p className={styles.profileIntro}>Paired Easy + Hard scores ranked by the combined total.</p>
        </div>
        <Link className={styles.profileLink} href="/records/combined">View full Combined leaderboard →</Link>
      </div>
      <div className={styles.profileCombinedRows}>
        {combined.loading ? <div className={styles.profileEmpty}>Loading…</div> : combined.error ? <div className={styles.profileEmpty}>{combined.error}</div> : combined.rows.length ? combined.rows.map((row) => {
          const fallback = row.key === bestFallbackKey
          return <div className={styles.profileCombinedRow} key={row.key}>
            <RankMark rank={row.rank} fallback={fallback} />
            <span className={styles.profileCourse} title={row.course}>{row.course}</span>
            <div className={styles.profileCombinedScores}>
              <span className={styles.combinedEasy}>Easy {row.easyScore}</span>
              <span className={styles.combinedHard}>Hard {row.hardScore}</span>
            </div>
            <span className={`${styles.profileScore} ${styles.total}`}>{row.totalScore}</span>
          </div>
        }) : <div className={styles.profileEmpty}>No Combined records yet.</div>}
      </div>
    </section>
  </section>
}
