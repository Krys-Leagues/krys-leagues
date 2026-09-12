"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"
import type { CourseChallengeCourse } from "@/lib/courseChallenges/types"
import styles from "./course-challenges.module.css"

type Player = { id: string; name: string; avatarUrl: string | null; highestLevel: number; levelStickerAsset: string | null; profileUrl: string }
type Group = { level: number; players: Player[] }
type SpecialGroup = { key: string; label: string; players: Array<{ player: Player; reward?: { assetPath: string | null } }> }
type Payload = { levelGroups: Group[]; specialGroups: SpecialGroup[] }

export default function CourseChallengeCommunity({ course }: { course: CourseChallengeCourse }) {
  const [payload, setPayload] = useState<Payload | null>(null)
  const [error, setError] = useState("")
  useEffect(() => { fetch("/api/course-challenges/community?courseSlug=" + encodeURIComponent(course.slug), { cache: "no-store" }).then(async response => { const data = await response.json() as Payload & { error?: string }; if (!response.ok) throw new Error(data.error || "Community progress could not be loaded."); setPayload(data) }).catch(caught => setError(caught instanceof Error ? caught.message : "Community progress could not be loaded.")) }, [course.slug])
  return <main className={styles.page} style={{ "--course-background-image": course.backgroundImage ? `url("${course.backgroundImage}")` : "none" } as React.CSSProperties}><div className={styles.shell}>
    <div className={styles.backLinks}><Link href={`/course-challenges/${course.slug}`} className={styles.backLink}>← {course.name} Book</Link><Link href="/course-challenges" className={styles.backLink}>← Course Challenges</Link></div>
    <header className={styles.communityHeader}><p className={styles.eyebrow}>COURSE CHALLENGE COMMUNITY</p><h1 className={styles.courseTitle}>WHO’S TAKING ON {course.name.toUpperCase()}?</h1><p className={styles.helper}>Players are grouped by the highest completed main Level for this course.</p></header>
    {error && <p className={styles.notice}>{error}</p>}
    {!payload && !error ? <p className={styles.helper}>Loading challengers…</p> : <>
      <div className={styles.communityGroups}>{payload?.levelGroups.map((group) => <details key={group.level} className={styles.communitySection} open={group.level === 1}><summary>LEVEL {group.level}<span>{group.players.length} challenger{group.players.length === 1 ? "" : "s"}</span></summary><PlayerGrid players={group.players} course={course} /></details>)}</div>
      <div className={styles.communityGroups}>{payload?.specialGroups.map((group) => <details key={group.key} className={styles.communitySection}><summary>{group.label.toUpperCase()}<span>{group.players.length} earned</span></summary><div className={styles.specialGrid}>{group.players.map(({ player, reward }) => <PlayerCard key={player.id} player={player} course={course} rewardAsset={reward?.assetPath || null} />)}</div></details>)}</div>
    </>}
  </div></main>
}

function PlayerGrid({ players, course }: { players: Player[]; course: CourseChallengeCourse }) { return players.length ? <div className={styles.communityGrid}>{players.map((player) => <PlayerCard key={player.id} player={player} course={course} />)}</div> : <p className={styles.communityEmpty}>No completed challengers in this Level yet.</p> }
function PlayerCard({ player, course, rewardAsset }: { player: Player; course: CourseChallengeCourse; rewardAsset?: string | null }) { return <article className={styles.communityCard}><Link href={player.profileUrl} className={styles.communityAvatarLink}>{player.avatarUrl ? <img src={player.avatarUrl} alt="" className={styles.communityAvatar} /> : <span className={styles.communityAvatarFallback}>{player.name.slice(0, 2).toUpperCase()}</span>}</Link><div><Link href={player.profileUrl} className={styles.communityPlayer}>{player.name}</Link><p>Highest completed: Level {player.highestLevel}</p></div>{rewardAsset && <Image src={rewardAsset} alt="" width={44} height={44} sizes="44px" />}{player.levelStickerAsset && <Image src={player.levelStickerAsset} alt={`${course.name} Level ${player.highestLevel} sticker`} width={44} height={44} sizes="44px" />}{player.highestLevel > 0 && <span className={styles.communityLevelSticker}>{course.name} L{player.highestLevel}</span>}</article> }
