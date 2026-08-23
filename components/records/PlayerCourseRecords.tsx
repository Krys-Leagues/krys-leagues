"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import styles from "./PublicRecordsUI.module.css"

type Category = "Easy" | "Hard" | "Combined Easy" | "Combined Hard"
type DisplayRow = { key: string; rank: number | null; course: string; score: number }
type CategoryState = { rows: DisplayRow[]; loading: boolean; error: string }

const CATEGORIES: Category[] = ["Easy", "Hard", "Combined Easy", "Combined Hard"]
const EMPTY_STATE: Record<Category, CategoryState> = {
  Easy: { rows: [], loading: true, error: "" },
  Hard: { rows: [], loading: true, error: "" },
  "Combined Easy": { rows: [], loading: true, error: "" },
  "Combined Hard": { rows: [], loading: true, error: "" },
}

function RankMark({ rank }: { rank: number | null }) {
  return <span className={styles.profileRankNumber}>{rank === null ? "—" : `#${rank}`}</span>
}

export default function PlayerCourseRecords({ playerId }: { playerId: string }) {
  const [categories, setCategories] = useState<Record<Category, CategoryState>>(EMPTY_STATE)

  useEffect(() => {
    let cancelled = false
    void Promise.all(CATEGORIES.map(async (category) => {
      try {
        const response = await fetch(`/api/records/public?view=profile&playerId=${encodeURIComponent(playerId)}&category=${encodeURIComponent(category)}`)
        const payload = await response.json() as { rows?: DisplayRow[]; error?: string }
        if (!response.ok) throw new Error(payload.error)
        return [category, { rows: payload.rows ?? [], loading: false, error: "" }] as const
      } catch (caught) {
        return [category, { rows: [], loading: false, error: caught instanceof Error ? caught.message : `${category} records could not be loaded.` }] as const
      }
    })).then((results) => {
      if (!cancelled) setCategories(Object.fromEntries(results) as Record<Category, CategoryState>)
    })
    return () => { cancelled = true }
  }, [playerId])

  return <section className={styles.profilePanel} aria-label="Krys Leagues All-Time Records">
    <header className={styles.profileShowcaseHeader}>
      <div>
        <p className={styles.profileEyebrow}>Player showcase</p>
        <h2 className={styles.profileHeading}>All-Time Records</h2>
        <p className={styles.profileIntro}>Current personal standings across individual and combined-map records.</p>
      </div>
      <Link className={styles.profileLink} href="/records">View full leaderboards →</Link>
    </header>

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
                <span className={styles.profileScore}>{row.score}</span>
              </div>
            }) : <div className={styles.profileEmpty}>No {category} records yet.</div>}
          </div>
        </section>
      })}
    </div>
  </section>
}
