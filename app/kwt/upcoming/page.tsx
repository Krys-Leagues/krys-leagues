"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { KWT_SEASON_TROPHY_BOARD_ASSET, KWT_WEEKLY_FEATURE_ASSET, SEASON_14_WEEKS, formatKwtWeekend, sortKwtCalendarWeeks, type KwtCalendarWeek } from "@/lib/kwtPublicContent"
import styles from "./page.module.css"

type Feature = { image_url: string | null; week_number: number | null; label: string | null }

export default function KWTUpcomingPage() {
  const [weeks, setWeeks] = useState<KwtCalendarWeek[]>([...SEASON_14_WEEKS])
  const [feature, setFeature] = useState<Feature>({
    image_url: KWT_WEEKLY_FEATURE_ASSET,
    week_number: 7,
    label: "KWT Week 6 → Week 7 feature",
  })
  const [boardAvailable, setBoardAvailable] = useState(true)

  useEffect(() => {
    let mounted = true
    void Promise.all([
      supabase.from("kwt_public_content").select("image_url, week_number, label").eq("content_type", "weekly_feature").eq("active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("kwt_public_content").select("id, season_number, week_number, start_date, end_date, display_order, active").eq("content_type", "calendar_week").eq("active", true).order("display_order"),
    ]).then(([featureResponse, calendarResponse]) => {
      if (!mounted) return
      if (!featureResponse.error && featureResponse.data?.image_url) setFeature(featureResponse.data as Feature)
      if (!calendarResponse.error && calendarResponse.data?.length) setWeeks(sortKwtCalendarWeeks(calendarResponse.data as KwtCalendarWeek[]))
    })
    return () => { mounted = false }
  }, [])

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Link href="/kwt" className={styles.back}>← Back to KWT</Link>
        <header className={styles.header}>
          <p className={styles.eyebrow}>KRYS LEAGUES · KRYS WEEKEND TOURNAMENT</p>
          <h1>Upcoming Events</h1>
          <p>Configured KWT weekends and the latest weekly feature.</p>
        </header>

        <section className={styles.section} aria-labelledby="weekly-feature-title">
          <h2 id="weekly-feature-title">Current weekly feature</h2>
          {feature?.image_url ? (
            <img className={styles.feature} src={feature.image_url} alt={feature.label || `KWT Week ${feature.week_number ?? ""} feature`} />
          ) : (
            <div className={styles.empty}>No weekly feature graphic has been published yet. An authorized admin can upload the next feature.</div>
          )}
          <span className={styles.assetNote}>Default approved asset: {KWT_WEEKLY_FEATURE_ASSET}</span>
        </section>

        <section className={styles.section} aria-labelledby="season-board-title">
          <h2 id="season-board-title">Season 14 trophy board</h2>
          <img className={styles.board} src={KWT_SEASON_TROPHY_BOARD_ASSET} alt="KWT Season 14 Week 1–12 trophy board" onError={(event) => { event.currentTarget.hidden = true; setBoardAvailable(false) }} />
          {!boardAvailable && <div className={styles.empty}>The approved Season 14 trophy-board asset is not present in this release yet.</div>}
        </section>

        <section className={styles.section} aria-labelledby="calendar-title">
          <h2 id="calendar-title">Season 14 weekend calendar</h2>
          <div className={styles.calendar}>
            {sortKwtCalendarWeeks(weeks).map((week) => (
              <div className={styles.week} key={`${week.season_number}-${week.week_number}`}>
                <strong>Week {week.week_number}</strong>
                <span>{formatKwtWeekend(week.start_date, week.end_date)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
