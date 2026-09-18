"use client"

import { useEffect, useRef, useState, type PointerEvent } from "react"

type View = { scale: number; rotation: number; x: number; y: number }
const RESET: View = { scale: 1, rotation: 0, x: 0, y: 0 }

export function ScorecardEvidenceViewer({ src, label }: { src: string; label: string }) {
  const [view, setView] = useState<View>(RESET)
  const [fullScreen, setFullScreen] = useState(false)
  const origin = useRef<{ px: number; py: number; x: number; y: number } | null>(null)

  useEffect(() => {
    if (!fullScreen) return
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setFullScreen(false) }
    window.addEventListener("keydown", close)
    return () => window.removeEventListener("keydown", close)
  }, [fullScreen])

  function start(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    origin.current = { px: event.clientX, py: event.clientY, x: view.x, y: view.y }
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!origin.current) return
    setView((current) => ({ ...current, x: origin.current!.x + event.clientX - origin.current!.px, y: origin.current!.y + event.clientY - origin.current!.py }))
  }
  const controls = <div className="flex flex-wrap gap-2" aria-label="Scorecard viewer controls">
    <button type="button" onClick={() => setView((current) => ({ ...current, scale: Math.min(5, current.scale + 0.25) }))}>Zoom In</button>
    <button type="button" onClick={() => setView((current) => ({ ...current, scale: Math.max(0.5, current.scale - 0.25) }))}>Zoom Out</button>
    <button type="button" onClick={() => setView(RESET)}>Reset Zoom</button>
    <button type="button" onClick={() => setView((current) => ({ ...current, rotation: (current.rotation + 90) % 360 }))}>Rotate</button>
    <button type="button" onClick={() => setFullScreen(true)}>Full Screen</button>
  </div>
  const image = (expanded = false) => <div
    className={`relative overflow-hidden rounded-2xl border border-cyan-300/25 bg-black/70 ${expanded ? "h-[calc(100vh-9rem)]" : "h-[58vh] min-h-[420px]"}`}
    onPointerDown={start}
    onPointerMove={move}
    onPointerUp={(event) => { origin.current = null; event.currentTarget.releasePointerCapture(event.pointerId) }}
    onPointerCancel={() => { origin.current = null }}
    data-scorecard-view={expanded ? "full-screen" : "review"}
  >
    {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed evidence URL */}
    <img src={src} alt={label} draggable={false} className="h-full w-full touch-none select-none object-contain" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale}) rotate(${view.rotation}deg)` }} />
  </div>

  return <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><strong>ORIGINAL SCORECARD</strong><p className="text-sm text-slate-300">Drag to pan. Zoom and rotate without changing the stored evidence.</p></div>{controls}</div>
    {image()}
    {fullScreen && <div className="fixed inset-0 z-50 space-y-3 overflow-auto bg-slate-950/95 p-4" role="dialog" aria-modal="true" aria-label="Full-screen scorecard evidence">
      <div className="flex flex-wrap items-center justify-between gap-3"><strong>{label}</strong><div className="flex flex-wrap gap-2">{controls}<button type="button" onClick={() => setFullScreen(false)}>Close</button></div></div>
      {image(true)}
    </div>}
  </section>
}
