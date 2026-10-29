"use client"

import { useEffect, useState } from "react"
import { profileDisplayRewardRank } from "@/lib/courseChallenges/rewards"
import styles from "./course-challenges.module.css"

type Reward = { rewardKey: string; label: string }

export default function CourseChallengeRewardSelector() {
  const [rewards, setRewards] = useState<Reward[]>([])
  const [selected, setSelected] = useState("")
  const [message, setMessage] = useState("")

  useEffect(() => {
    fetch("/api/course-challenges/profile", { cache: "no-store" }).then((response) => response.ok ? response.json() as Promise<{ profileRewards?: Reward[]; selectedRewardKey?: string | null }> : null).then((payload) => { if (payload) { setRewards([...(payload.profileRewards || [])].sort((left, right) => profileDisplayRewardRank(left.rewardKey) - profileDisplayRewardRank(right.rewardKey))); setSelected(payload.selectedRewardKey || "") } }).catch(() => undefined)
  }, [])

  if (!rewards.length) return null
  async function save(value: string) {
    setSelected(value); setMessage("")
    const response = await fetch("/api/course-challenges/profile/selection", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rewardKey: value || null }) })
    const payload = await response.json() as { error?: string }
    setMessage(response.ok ? "Profile reward selection saved." : payload.error || "Selection could not be saved.")
  }

  return <section className={styles.sideCard} aria-label="Course Challenge profile reward selection"><h3>SHOW OFF WHAT YOU EARN</h3><p>Choose None or an earned Course Pro, Ace Challenge, Level 5, or Course Master reward for display on your Player Profile in place of your regular profile image. This changes display only; it never changes ownership.</p><label className={styles.field}>Selected reward<select value={selected} onChange={(event) => void save(event.target.value)}><option value="">None</option>{rewards.map((reward) => <option value={reward.rewardKey} key={reward.rewardKey}>{reward.label}</option>)}</select></label>{message && <p className={styles.helper}>{message}</p>}</section>
}
