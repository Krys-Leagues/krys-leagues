"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { COURSE_CHALLENGE_REACTIONS } from "@/lib/courseChallenges/celebrations"
import styles from "./course-challenges.module.css"

type Celebration = { id: string; playerId: string; playerName: string; avatarUrl: string | null; courseSlug: string; courseName: string; rewardLabel: string; rewardAsset: string | null; earnedAt: string | null; reactions: Record<string, number>; viewerReaction: string | null }
type Payload = { date: string; celebrations: Celebration[]; reactionsEnabled: boolean }

function dayValue(offset: number) {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() - offset)
  return date.toISOString().slice(0, 10)
}

function dayLabel(date: string, offset: number) {
  if (offset === 0) return "TODAY"
  return new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" }).format(new Date(date + "T12:00:00Z")).toUpperCase()
}

export default function CourseChallengeCelebrations() {
  const days = useMemo(() => Array.from({ length: 7 }, (_, offset) => ({ date: dayValue(offset), offset })), [])
  const [selectedDate, setSelectedDate] = useState(days[0]?.date || dayValue(0))
  const [payload, setPayload] = useState<Payload>({ date: selectedDate, celebrations: [], reactionsEnabled: false })
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")

  async function load(date: string) {
    setLoading(true)
    setMessage("")
    try {
      const response = await fetch("/api/course-challenges/celebrations?date=" + encodeURIComponent(date), { cache: "no-store" })
      const next = await response.json() as Payload & { error?: string }
      if (!response.ok) throw new Error(next.error || "Celebrations could not be loaded.")
      setPayload(next)
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Celebrations could not be loaded.")
    } finally {
      setLoading(false)
    }
  }

  // The selected day is an external fetch key; load the matching server data whenever it changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(selectedDate) }, [selectedDate])

  async function react(rewardId: string, reaction: string, current: string | null) {
    if (!payload.reactionsEnabled) {
      setMessage("Sign in with a Player Profile to react.")
      return
    }
    try {
      const response = current === reaction
        ? await fetch("/api/course-challenges/celebrations?rewardId=" + encodeURIComponent(rewardId), { method: "DELETE" })
        : await fetch("/api/course-challenges/celebrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rewardId, reaction }) })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || "Reaction could not be saved.")
      await load(selectedDate)
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Reaction could not be saved.")
    }
  }

  return <section className={styles.celebrations} aria-labelledby="course-challenge-celebrations-title">
    <div className={styles.celebrationsHeader}><div><p className={styles.eyebrow}>COMMUNITY MILESTONES</p><h2 id="course-challenge-celebrations-title">COURSE CHALLENGE CELEBRATIONS</h2><p>Celebrate what our players are earning!</p></div></div>
    <nav className={styles.daySelector} aria-label="Celebration days">
      {days.map(({ date, offset }) => <button type="button" key={date} aria-pressed={selectedDate === date} data-selected={selectedDate === date} onClick={() => setSelectedDate(date)}>{dayLabel(date, offset)}<small>{date.slice(5).replace("-", "/")}</small></button>)}
    </nav>
    {message && <p className={styles.notice} role="status">{message}</p>}
    {loading ? <p className={styles.helper}>Loading achievements…</p> : payload.celebrations.length === 0 ? <p className={styles.emptyCelebrations}>No Course Challenge achievements yet today.</p> : <div className={styles.celebrationGrid}>
      {payload.celebrations.map((item) => <article className={styles.celebrationCard} key={item.id}>
        <div className={styles.celebrationIdentity}><Link href={`/players/${encodeURIComponent(item.playerId)}`} className={styles.avatarLink}>{item.avatarUrl ? <img src={item.avatarUrl} alt="" className={styles.celebrationAvatar} /> : <span className={styles.celebrationAvatarFallback}>{item.playerName.slice(0, 2).toUpperCase()}</span>}</Link><div><Link href={`/players/${encodeURIComponent(item.playerId)}`} className={styles.celebrationPlayer}>{item.playerName}</Link><p>earned {item.courseName} — {item.rewardLabel}</p></div></div>
        <div className={styles.celebrationReward}>{item.rewardAsset ? <Image src={item.rewardAsset} alt="" width={54} height={54} sizes="54px" /> : <span className={styles.rewardMark} aria-hidden="true">✦</span>}<time dateTime={item.earnedAt || undefined}>{item.earnedAt ? new Date(item.earnedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Earned"}</time></div>
        <div className={styles.reactionRow} aria-label={`Reactions for ${item.playerName}`}>
          {COURSE_CHALLENGE_REACTIONS.map((reaction) => <button type="button" key={reaction} className={styles.reactionButton} data-selected={item.viewerReaction === reaction} onClick={() => void react(item.id, reaction, item.viewerReaction)} aria-label={`React ${reaction}`}><span>{reaction}</span><small>{item.reactions[reaction] || 0}</small></button>)}
        </div>
      </article>)}
    </div>}
  </section>
}
