"use client"

import Image from "next/image"
import { useEffect, useState } from "react"

type SiteAccessMode = "prelaunch" | "public"
type LaunchStatus = "loading" | "ready" | "busy" | "error"

type SiteAccessState = {
  mode: SiteAccessMode
  updated_at: string
  last_changed_at: string | null
}

async function fetchSiteAccessState() {
  const response = await fetch("/api/admin/site-access", { cache: "no-store" })
  const state = (await response.json()) as SiteAccessState | { error?: string }
  if (!response.ok || !("mode" in state)) throw new Error("state_unavailable")
  return state
}

export default function LaunchControl() {
  const [mode, setMode] = useState<SiteAccessMode | null>(null)
  const [status, setStatus] = useState<LaunchStatus>("loading")
  const [message, setMessage] = useState("Checking the live launch state…")

  useEffect(() => {
    let cancelled = false

    void fetchSiteAccessState()
      .then((state) => {
        if (cancelled) return
        setMode(state.mode)
        setStatus("ready")
        setMessage(state.mode === "public" ? "The player-facing site is live." : "The player-facing site is still private.")
      })
      .catch(() => {
        if (cancelled) return
        setStatus("error")
        setMessage("The live launch state could not be verified. No change was made.")
      })

    return () => {
      cancelled = true
    }
  }, [])

  async function setModeFromControl(nextMode: SiteAccessMode) {
    if (nextMode === "prelaunch" && !window.confirm("Return the site to Private Testing now?")) return

    setStatus("busy")
    setMessage(nextMode === "public" ? "Publishing the site…" : "Returning the site to Private Testing…")
    try {
      const response = await fetch("/api/admin/site-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: nextMode }),
      })
      const result = (await response.json()) as { new_mode?: SiteAccessMode; changed?: boolean; error?: string }
      if (!response.ok || (result.new_mode !== nextMode && result.new_mode !== mode)) throw new Error(result.error || "update_failed")
      setMode(result.new_mode ?? nextMode)
      setStatus("ready")
      setMessage(nextMode === "public" ? "PUBLIC LIVE — the player-facing site is now open." : "PRIVATE TESTING — the gate is back on.")
    } catch {
      setStatus("error")
      setMessage("The state change could not be confirmed. Check the site before trying again.")
    }
  }

  const isPublic = mode === "public"
  const isBusy = status === "busy" || status === "loading"

  return (
    <main style={page}>
      <section style={panel} aria-live="polite">
        <p style={eyebrow}>Krys Leagues · Launch Control</p>
        <h1 style={title}>One click to go live.</h1>
        <p style={subtitle}>This control changes the persistent site gate immediately. It does not redeploy Vercel.</p>

        <div style={stateBadge(isPublic)}>{isPublic ? "PUBLIC LIVE" : "PRIVATE TESTING"}</div>
        <p style={messageText}>{message}</p>

        <button
          type="button"
          onClick={() => void setModeFromControl("public")}
          disabled={isBusy || isPublic}
          aria-label="Launch Krys Leagues publicly"
          style={golfBallButton(isBusy || isPublic)}
        >
          <span style={golfBall}>
            <span style={dimpleField} aria-hidden="true" />
            <Image
              src="/krys-leagues-launch-mark.png"
              alt="Krys Leagues"
              width={360}
              height={360}
              priority
              sizes="(max-width: 640px) 62vw, 360px"
              style={mark}
            />
            <span style={ballLabel}>{isPublic ? "LIVE" : "LAUNCH"}</span>
          </span>
        </button>

        <p style={instruction}>{isPublic ? "Already public. The launch control is safely disabled." : "Click the golf ball once when you are ready for the livestream."}</p>

        <details style={rollbackDetails}>
          <summary style={rollbackSummary}>Emergency rollback</summary>
          <div style={rollbackPanel}>
            <p style={rollbackText}>This separate control returns player-facing routes to Private Testing. It requires confirmation.</p>
            <button type="button" onClick={() => void setModeFromControl("prelaunch")} disabled={isBusy || !isPublic} style={rollbackButton}>
              Return to Private Testing
            </button>
          </div>
        </details>
      </section>
    </main>
  )
}

const page: React.CSSProperties = {
  minHeight: "calc(100vh - 74px)",
  display: "grid",
  placeItems: "center",
  padding: "28px 18px 54px",
  background: "radial-gradient(circle at 50% 8%, #173a42 0%, #070b12 46%, #020204 100%)",
}

const panel: React.CSSProperties = {
  width: "min(100%, 720px)",
  padding: "clamp(24px, 6vw, 56px)",
  border: "1px solid #30434c",
  borderRadius: 28,
  background: "rgba(3, 8, 13, .94)",
  boxShadow: "0 22px 80px rgba(0, 0, 0, .5)",
  textAlign: "center",
}

const eyebrow: React.CSSProperties = { margin: 0, color: "#f0a4cf", fontSize: 12, fontWeight: 900, letterSpacing: ".18em", textTransform: "uppercase" }
const title: React.CSSProperties = { margin: "10px 0 8px", fontSize: "clamp(30px, 6vw, 52px)", letterSpacing: "-.04em" }
const subtitle: React.CSSProperties = { maxWidth: 520, margin: "0 auto 22px", color: "#b9c8ce", lineHeight: 1.55 }
const messageText: React.CSSProperties = { minHeight: 24, margin: "16px auto", color: "#d5e2e6", lineHeight: 1.45 }
const instruction: React.CSSProperties = { margin: "20px auto 0", color: "#91a4ab", fontSize: 14, lineHeight: 1.5 }
const mark: React.CSSProperties = { position: "absolute", inset: "19%", width: "62%", height: "62%", objectFit: "contain", filter: "drop-shadow(0 5px 7px rgba(0,0,0,.35))" }
const dimpleField: React.CSSProperties = { position: "absolute", inset: 0, borderRadius: "50%", backgroundImage: "radial-gradient(circle at 18% 26%, rgba(80, 105, 118, .32) 0 3px, transparent 4px), radial-gradient(circle at 42% 16%, rgba(80, 105, 118, .25) 0 3px, transparent 4px), radial-gradient(circle at 75% 24%, rgba(80, 105, 118, .25) 0 3px, transparent 4px), radial-gradient(circle at 28% 74%, rgba(80, 105, 118, .22) 0 3px, transparent 4px), radial-gradient(circle at 70% 76%, rgba(80, 105, 118, .24) 0 3px, transparent 4px)", opacity: .7 }
const ballLabel: React.CSSProperties = { position: "absolute", bottom: "13%", left: 0, right: 0, color: "#3d4c54", fontSize: "clamp(11px, 2vw, 15px)", fontWeight: 1000, letterSpacing: ".22em" }
const golfBall: React.CSSProperties = { position: "relative", display: "block", width: "min(68vw, 390px)", aspectRatio: "1", borderRadius: "50%", overflow: "hidden", background: "radial-gradient(circle at 32% 24%, #fff 0%, #f3f6f7 36%, #cbd6da 74%, #71828a 100%)", boxShadow: "inset -22px -28px 38px rgba(30, 45, 53, .3), inset 16px 13px 26px rgba(255,255,255,.95), 0 20px 24px rgba(0,0,0,.45)" }
const golfBallButton = (disabled: boolean): React.CSSProperties => ({ display: "inline-block", padding: 0, border: 0, borderRadius: "50%", background: "transparent", cursor: disabled ? "default" : "pointer", opacity: disabled ? .72 : 1, transition: "transform .16s ease, filter .16s ease", filter: disabled ? "grayscale(.22)" : "none", touchAction: "manipulation" })
const stateBadge = (isPublic: boolean): React.CSSProperties => ({ display: "inline-block", padding: "9px 16px", borderRadius: 999, color: isPublic ? "#042e1b" : "#fff7ed", background: isPublic ? "#86efac" : "#c026d3", fontWeight: 1000, letterSpacing: ".12em", fontSize: 14, boxShadow: isPublic ? "0 0 26px rgba(134,239,172,.25)" : "0 0 26px rgba(192,38,211,.22)" })
const rollbackDetails: React.CSSProperties = { marginTop: 34, textAlign: "left", borderTop: "1px solid #223039", paddingTop: 16 }
const rollbackSummary: React.CSSProperties = { color: "#fca5a5", cursor: "pointer", fontWeight: 800, fontSize: 14 }
const rollbackPanel: React.CSSProperties = { marginTop: 12, padding: 16, border: "1px solid #4b252b", borderRadius: 12, background: "#160d10" }
const rollbackText: React.CSSProperties = { margin: "0 0 12px", color: "#d5b7ba", fontSize: 13, lineHeight: 1.45 }
const rollbackButton: React.CSSProperties = { minHeight: 42, padding: "10px 14px", border: "1px solid #ef4444", borderRadius: 8, background: "#451a1d", color: "#fee2e2", font: "inherit", fontWeight: 800, cursor: "pointer" }
