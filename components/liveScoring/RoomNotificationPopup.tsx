"use client"

import type { RoomAssignment, TournamentScoringConfig } from "@/lib/liveScoring/types"
import { formatRoundDate } from "@/lib/liveScoring/engine"
import styles from "./DemoStudio.module.css"

export default function RoomNotificationPopup({ config, room, onDismiss, onOpenScorecard }: {
  config: TournamentScoringConfig
  room: RoomAssignment
  onDismiss: () => void
  onOpenScorecard: () => void
}) {
  const round = config.rounds.find((item) => item.id === room.roundId)
  return <div className={styles.scrim}><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="room-title">
    <p className={styles.eyebrow}>{config.name} · room published</p><h2 id="room-title">{room.screenName}, you’re in {room.roomName}</h2>
    <p>{room.course} · {room.difficulty.toUpperCase()}</p><p>{round?.label || "Tournament round"} · {round ? formatRoundDate(round) : "Date unavailable"}</p>
    <p><strong>Eastern:</strong> {formatTime(room.startsAt, "America/New_York")}<br /><strong>Your local time ({room.timeZone}):</strong> {formatTime(room.startsAt, room.timeZone)}</p>
    <h3>Players in {room.roomName}</h3><ul>{room.roomRoster.map((name) => <li key={name}>{name}</li>)}</ul>
    <div className={styles.modalActions}><a href="#submission" onClick={() => { onOpenScorecard(); onDismiss() }}>View room &amp; submit scorecard</a><button onClick={onDismiss}>Dismiss</button></div>
  </section></div>
}

function formatTime(value: string, timeZone: string) {
  try { return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short" }).format(new Date(value)) }
  catch { return "Time zone unavailable" }
}
