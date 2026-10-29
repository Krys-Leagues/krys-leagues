"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import type { KeyboardEvent, FocusEvent } from "react"
import type { TourneyBotMatch, TourneyBotPreview } from "@/lib/tourneyBot"
import styles from "./live-bracket-panel.module.css"

export const LIVE_BRACKET_ROTATION_MS = 15_000

const externalArtworkLoader = ({ src }: { src: string }) => src

function matchLabel(match: TourneyBotMatch, side: "one" | "two") {
  const name = side === "one" ? match.playerOne : match.playerTwo
  const score = side === "one" ? match.scoreOne : match.scoreTwo
  return `${name || "—"}${score ? ` (${score})` : ""}`
}

function BracketContent({ preview }: { preview: TourneyBotPreview }) {
  if (!preview.available) {
    return <p className={styles.empty} role="status">{preview.error || "Live bracket preview is temporarily unavailable."}</p>
  }

  return (
    <>
      <div className={styles.meta}>
        <span>{preview.participantCount === null ? "Participant count unavailable" : `${preview.participantCount} participants`}</span>
        {preview.artworkUrl ? (
          <Image className={styles.artworkImage} loader={externalArtworkLoader} src={preview.artworkUrl} alt={`${preview.name} Tourney Bot artwork`} width={96} height={54} unoptimized />
        ) : null}
      </div>
      {preview.rounds.length > 0 ? (
        <div className={styles.rounds} aria-label={`${preview.name} live bracket rounds`}>
          {preview.rounds.map((round) => (
            <section className={styles.round} key={round.name}>
              <h4>{round.name}</h4>
              {round.matches.length > 0 ? round.matches.map((match, index) => (
                <div className={styles.match} key={`${round.name}-${index}`}>
                  <span>{matchLabel(match, "one")}</span>
                  <span aria-hidden="true">vs</span>
                  <span>{matchLabel(match, "two")}</span>
                  <small>{match.status || "Pending"}</small>
                </div>
              )) : <p className={styles.empty}>No public matchups reported yet.</p>}
            </section>
          ))}
        </div>
      ) : <p className={styles.empty}>No public bracket matchups reported yet.</p>}
      {preview.participants.length > 0 ? <details className={styles.participants}><summary>Public participants ({preview.participants.length})</summary><p>{preview.participants.join(", ")}</p></details> : null}
    </>
  )
}

export default function LiveBracketPanel({ previews, autoRotate = true, variant = "artwork" }: { previews: TourneyBotPreview[]; autoRotate?: boolean; variant?: "artwork" | "standalone" }) {
  const [selectedId, setSelectedId] = useState(previews[0]?.id || "")
  const [reducedMotion, setReducedMotion] = useState(true)
  const [interacting, setInteracting] = useState(false)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const current = previews.find((preview) => preview.id === selectedId) || previews[0]

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReducedMotion(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  useEffect(() => {
    if (!autoRotate || reducedMotion || interacting || previews.length < 2) return
    const timer = window.setInterval(() => {
      setSelectedId((id) => {
        const index = Math.max(0, previews.findIndex((preview) => preview.id === id))
        return previews[(index + 1) % previews.length]?.id || id
      })
    }, LIVE_BRACKET_ROTATION_MS)
    return () => window.clearInterval(timer)
  }, [autoRotate, interacting, previews, reducedMotion])

  const selectTournament = (id: string, index: number) => {
    setSelectedId(id)
    setInteracting(true)
    tabRefs.current[index]?.focus()
  }

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const nextIndex = event.key === "ArrowRight" || event.key === "ArrowDown" ? (index + 1) % previews.length : event.key === "ArrowLeft" || event.key === "ArrowUp" ? (index - 1 + previews.length) % previews.length : event.key === "Home" ? 0 : event.key === "End" ? previews.length - 1 : -1
    if (nextIndex < 0) return
    event.preventDefault()
    selectTournament(previews[nextIndex].id, nextIndex)
  }

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setInteracting(false)
  }

  const onPointerEnter = () => setInteracting(true)
  const onPointerLeave = () => setInteracting(false)

  if (!current) return <div className={`${styles.rotator} ${variant === "artwork" ? styles.artworkPanel : styles.standalone}`} role="status">Live bracket preview is temporarily unavailable.</div>

  return (
    <section
      className={`${styles.rotator} ${variant === "artwork" ? styles.artworkPanel : styles.standalone}`}
      aria-label="Live bracket preview"
      data-auto-rotate={autoRotate && !reducedMotion}
      data-rotation-interval={LIVE_BRACKET_ROTATION_MS}
      onFocusCapture={() => setInteracting(true)}
      onBlurCapture={onBlur}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <div className={styles.tabs} role="tablist" aria-label="Active live tournaments">
        {previews.map((preview, index) => (
          <button
            className={preview.id === current.id ? styles.activeTab : styles.tab}
            key={preview.id}
            onClick={() => selectTournament(preview.id, index)}
            onKeyDown={(event) => onTabKeyDown(event, index)}
            ref={(element) => { tabRefs.current[index] = element }}
            role="tab"
            aria-selected={preview.id === current.id}
            aria-controls="live-bracket-panel-content"
            type="button"
          >
            {preview.name}
          </button>
        ))}
      </div>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Live bracket preview</p>
          <h2>{current.name}</h2>
        </div>
        <span className={current.available ? styles.live : styles.unavailable}>{current.status}</span>
      </div>
      <div id="live-bracket-panel-content" className={styles.content} role="tabpanel" aria-label={`${current.name} bracket`}>
        <BracketContent preview={current} />
      </div>
      <div className={styles.footer}>
        <span role="status" aria-live="polite">{reducedMotion ? "Manual tournament selection" : interacting ? "Rotation paused while you interact" : autoRotate ? "Automatically rotates every 15 seconds" : "Manual tournament selection"}</span>
        <a href={current.url} target="_blank" rel="noopener noreferrer">View full bracket ↗</a>
      </div>
    </section>
  )
}
