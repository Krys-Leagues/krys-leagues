"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import PlayerAvatar from "@/components/PlayerAvatar"
import { getCanonicalPlayerAvatar } from "@/lib/playerAvatars"
import { supabase } from "@/lib/supabase"
import { TOUR_DEFINITIONS, guidedTourStepPath, guidedTourStorageKey, isTourOfferSafePath, shouldHidePlayerTools, type GuidedTourPreference } from "@/lib/guidedTour"
import styles from "./PlayerGuidedTour.module.css"

type Player = { id: string; avatarPath: string | null }
type Rect = { top: number; left: number; width: number; height: number }

function canonicalIdFromRpc(data: unknown) {
  if (typeof data === "string" && data.trim()) return data.trim()
  const row = Array.isArray(data) ? data[0] : data
  if (row && typeof row === "object" && "canonical_player_id" in row) {
    const value = (row as { canonical_player_id?: unknown }).canonical_player_id
    return typeof value === "string" && value.trim() ? value.trim() : null
  }
  return null
}

export default function PlayerGuidedTour() {
  const pathname = usePathname()
  const router = useRouter()
  const [player, setPlayer] = useState<Player | null>(null)
  const [, setPreference] = useState<GuidedTourPreference | null>(null)
  const [welcomeOpen, setWelcomeOpen] = useState(false)
  const [activeTourId, setActiveTourId] = useState("full")
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<Rect | null>(null)

  const loadPlayer = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) { setPlayer(null); return }
    const { data, error } = await supabase.rpc("current_user_canonical_player_id")
    const canonicalId = error ? null : canonicalIdFromRpc(data)
    if (!canonicalId) { setPlayer(null); return }
    let avatarPath: string | null = null
    try { avatarPath = (await getCanonicalPlayerAvatar(canonicalId)).avatarPath } catch { /* logo fallback */ }
    setPlayer({ id: canonicalId, avatarPath })
  }, [])

  useEffect(() => {
    // The automatic first-login tour is intentionally retired. Voluntary
    // area-help controls remain available through TourThisArea.
    return
    /*
    // Auth/session state is an external subscription; the async resolver updates the local view when it completes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPlayer()
    const { data: listener } = supabase.auth.onAuthStateChange(() => void loadPlayer())
    return () => listener.subscription.unsubscribe()
  }, [loadPlayer])

  useEffect(() => {
    if (!player || typeof window === "undefined") return
    const stored = window.localStorage.getItem(guidedTourStorageKey(player.id)) as GuidedTourPreference | null
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreference(stored)
    setWelcomeOpen(stored === null && isTourOfferSafePath(pathname))
    */
  }, [player, pathname])

  const activeTour = TOUR_DEFINITIONS[activeTourId] || TOUR_DEFINITIONS.full
  const currentStep = activeTour.steps[stepIndex]
  const currentPath = currentStep ? guidedTourStepPath(currentStep, player?.id || "") : "/"

  const measureTarget = useCallback(() => {
    if (!running || !currentStep) return false
    const node = document.querySelector(currentStep.target)
    if (!(node instanceof HTMLElement)) { setTargetRect(null); return false }
    node.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" })
    const rect = node.getBoundingClientRect()
    setTargetRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height })
    return true
  }, [currentStep, running])

  useEffect(() => {
    if (!running) return
    let attempts = 0
    let timer: number | undefined
    const retry = () => {
      if (measureTarget() || attempts >= 20) return
      attempts += 1
      timer = window.setTimeout(retry, 100)
    }
    retry()
    const refresh = () => { void measureTarget() }
    window.addEventListener("resize", refresh)
    window.addEventListener("scroll", refresh, { passive: true })
    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
      window.removeEventListener("resize", refresh)
      window.removeEventListener("scroll", refresh)
    }
  }, [currentPath, measureTarget, pathname, running])

  const setStoredPreference = useCallback((value: GuidedTourPreference) => {
    if (!player || typeof window === "undefined") return
    window.localStorage.setItem(guidedTourStorageKey(player.id), value)
    setPreference(value)
  }, [player])

  const startTour = useCallback((tourId = "full") => {
    const definition = TOUR_DEFINITIONS[tourId] || TOUR_DEFINITIONS.full
    setActiveTourId(definition.id)
    setStepIndex(0)
    setPaused(false)
    setRunning(true)
    setWelcomeOpen(false)
    setStoredPreference("started")
    const firstPath = player ? guidedTourStepPath(definition.steps[0], player.id) : "/"
    if (firstPath !== pathname) router.push(firstPath)
  }, [pathname, player, router, setStoredPreference])

  const closeTour = useCallback((value: GuidedTourPreference = "dismissed") => {
    setStoredPreference(value)
    setRunning(false)
    setPaused(false)
    setTargetRect(null)
  }, [setStoredPreference])

  const pauseTour = () => { setPaused(true); setRunning(false); setTargetRect(null) }
  const resumeTour = () => { setPaused(false); setRunning(true) }

  const advance = useCallback(() => {
    if (!currentStep) return
    if (currentStep.actionTarget) {
      const actionNode = document.querySelector(currentStep.actionTarget)
      if (actionNode instanceof HTMLInputElement && (actionNode.type === "checkbox" || actionNode.type === "radio") && actionNode.checked) {
        // The tour selects a live option without toggling an already-selected control off.
      } else if (actionNode instanceof HTMLElement) {
        actionNode.click()
      }
    }
    if (stepIndex >= activeTour.steps.length - 1) { closeTour("completed"); return }
    const nextIndex = stepIndex + 1
    setStepIndex(nextIndex)
    const nextPath = player ? guidedTourStepPath(activeTour.steps[nextIndex], player.id) : "/"
    if (nextPath !== pathname) router.push(nextPath)
  }, [activeTour.steps, closeTour, currentStep, pathname, player, router, stepIndex])

  const goBack = useCallback(() => {
    if (stepIndex === 0) return
    const previousIndex = stepIndex - 1
    setStepIndex(previousIndex)
    const previousPath = player ? guidedTourStepPath(activeTour.steps[previousIndex], player.id) : "/"
    if (previousPath !== pathname) router.push(previousPath)
  }, [activeTour.steps, pathname, player, router, stepIndex])

  useEffect(() => {
    const onAreaStart = (event: Event) => {
      const tourId = (event as CustomEvent<{ tourId?: string }>).detail?.tourId || "full"
      startTour(tourId)
    }
    window.addEventListener("krys-guided-tour-start", onAreaStart)
    return () => window.removeEventListener("krys-guided-tour-start", onAreaStart)
  }, [startTour])

  useEffect(() => {
    if (!running) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeTour()
      if (event.key === "ArrowRight" || event.key === "Enter") { event.preventDefault(); advance() }
      if (event.key === "ArrowLeft") { event.preventDefault(); goBack() }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [advance, closeTour, goBack, running])

  const panelStyle = useMemo(() => {
    if (!targetRect) return undefined
    const viewportWidth = typeof window === "undefined" ? 1024 : window.innerWidth
    const viewportHeight = typeof window === "undefined" ? 768 : window.innerHeight
    const panelWidth = Math.min(380, viewportWidth - 32)
    const left = Math.max(16, Math.min(viewportWidth - panelWidth - 16, targetRect.left + targetRect.width / 2 - panelWidth / 2))
    const below = targetRect.top + targetRect.height + 18
    const top = below + 220 < viewportHeight ? below : Math.max(16, targetRect.top - 230)
    return { top, left, width: panelWidth }
  }, [targetRect])

  if (!player) return null

  return <>
    {!shouldHidePlayerTools(pathname) && <nav className={styles.playerTools} aria-label="Player tools">
      <Link href={`/players/${encodeURIComponent(player.id)}`} className={styles.profileShortcut} data-tour="my-profile-shortcut">
        <PlayerAvatar screenName="My profile" avatarPath={player.avatarPath} size={34} imageFit="cover" />
        <span>MY PROFILE</span>
      </Link>
      <button type="button" className={styles.helpButton} data-tour="tour-help" aria-label={paused ? "Resume guided tour" : "Open the Krys Leagues guided tour"} onClick={paused ? resumeTour : () => startTour("full")}>{paused ? "▶" : "?"}</button>
    </nav>}

    {welcomeOpen && isTourOfferSafePath(pathname) && <div className={styles.modalBackdrop} role="presentation">
      <section className={styles.welcomeCard} role="dialog" aria-modal="true" aria-labelledby="guided-tour-welcome-title">
        <p className={styles.eyebrow}>KRYS LEAGUES</p><h2 id="guided-tour-welcome-title">WELCOME TO KRYS LEAGUES!</h2><p>Want a quick tour of how everything works?</p>
        <div className={styles.actions}><button type="button" className={styles.primaryButton} onClick={() => startTour("full")}>START TOUR</button><button type="button" className={styles.secondaryButton} onClick={() => closeTour("dismissed")}>MAYBE LATER</button><button type="button" className={styles.textButton} onClick={() => closeTour("skipped")}>SKIP TOUR</button></div>
      </section>
    </div>}

    {running && currentStep && <div className={styles.tourLayer} role="presentation">
      {targetRect && <div className={styles.spotlight} style={{ top: targetRect.top - 8, left: targetRect.left - 8, width: targetRect.width + 16, height: targetRect.height + 16 }} />}
      <section className={styles.tourCard} style={panelStyle} role="dialog" aria-modal="true" aria-labelledby="guided-tour-step-title">
        <button type="button" className={styles.closeButton} aria-label="Close guided tour" onClick={() => closeTour()}>×</button>
        <p className={styles.stepCounter}>{activeTour.label.toUpperCase()} · STEP {stepIndex + 1} OF {activeTour.steps.length}</p><h2 id="guided-tour-step-title">{currentStep.title}</h2><p>{currentStep.description}</p>
        <div className={styles.actions}><button type="button" className={styles.secondaryButton} disabled={stepIndex === 0} onClick={goBack}>BACK</button><button type="button" className={styles.secondaryButton} onClick={pauseTour}>PAUSE</button><button type="button" className={styles.textButton} onClick={() => closeTour("skipped")}>SKIP</button><button type="button" className={styles.primaryButton} onClick={advance}>{stepIndex === activeTour.steps.length - 1 ? "FINISH" : "NEXT"}</button></div>
      </section>
    </div>}
  </>
}
