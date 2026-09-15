"use client"

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type PointerEvent } from "react"

type ScorecardEvidenceProps = {
  file: File | null
  objectUrl: string | null
  onSelect: (file: File) => void
  onClear: () => void
}

type ViewState = { scale: number; rotation: number; x: number; y: number }

const FIT_VIEW: ViewState = { scale: 1, rotation: 0, x: 0, y: 0 }

export function ScorecardEvidence({ file, objectUrl, onSelect, onClear }: ScorecardEvidenceProps) {
  const [view, setView] = useState<ViewState>(FIT_VIEW)
  const [lightbox, setLightbox] = useState(false)
  const dragOrigin = useRef<{ pointerX: number; pointerY: number; imageX: number; imageY: number } | null>(null)

  useEffect(() => {
    if (!lightbox) return
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setLightbox(false) }
    window.addEventListener("keydown", close)
    return () => window.removeEventListener("keydown", close)
  }, [lightbox])

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0]
    if (selected) onSelect(selected)
    event.target.value = ""
  }

  function drop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    const selected = event.dataTransfer.files?.[0]
    if (selected) onSelect(selected)
  }

  function startPan(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragOrigin.current = { pointerX: event.clientX, pointerY: event.clientY, imageX: view.x, imageY: view.y }
  }

  function pan(event: PointerEvent<HTMLDivElement>) {
    if (!dragOrigin.current) return
    setView((current) => ({
      ...current,
      x: dragOrigin.current!.imageX + event.clientX - dragOrigin.current!.pointerX,
      y: dragOrigin.current!.imageY + event.clientY - dragOrigin.current!.pointerY,
    }))
  }

  const controls = <div className="flex flex-wrap gap-2" aria-label="Scorecard image controls">
    <button type="button" className="rounded-lg border border-sky-300/30 px-3 py-2 text-sm" onClick={() => setView((current) => ({ ...current, scale: Math.min(4, current.scale + 0.25) }))}>Zoom in</button>
    <button type="button" className="rounded-lg border border-sky-300/30 px-3 py-2 text-sm" onClick={() => setView((current) => ({ ...current, scale: Math.max(0.5, current.scale - 0.25) }))}>Zoom out</button>
    <button type="button" className="rounded-lg border border-sky-300/30 px-3 py-2 text-sm" onClick={() => setView(FIT_VIEW)}>Fit / reset</button>
    <button type="button" className="rounded-lg border border-sky-300/30 px-3 py-2 text-sm" onClick={() => setView((current) => ({ ...current, rotation: (current.rotation + 90) % 360 }))}>Rotate</button>
    <button type="button" className="rounded-lg border border-sky-300/30 px-3 py-2 text-sm" onClick={() => setLightbox(true)}>Full screen</button>
    <button type="button" className="rounded-lg border border-rose-300/30 px-3 py-2 text-sm text-rose-100" onClick={onClear}>Remove</button>
  </div>

  const image = (fullScreen = false) => <div
    className={`relative overflow-hidden rounded-xl border border-sky-300/20 bg-black/60 ${fullScreen ? "h-[calc(100vh-9rem)]" : "h-[52vh] min-h-80 max-h-[760px]"}`}
    data-testid={fullScreen ? "scorecard-lightbox-image" : "scorecard-preview"}
    onPointerDown={startPan}
    onPointerMove={pan}
    onPointerUp={(event) => { dragOrigin.current = null; event.currentTarget.releasePointerCapture(event.pointerId) }}
    onPointerCancel={() => { dragOrigin.current = null }}
  >
    {/* eslint-disable-next-line @next/next/no-img-element -- local object URLs are intentionally not optimized or uploaded for display */}
    <img
      src={objectUrl ?? ""}
      alt="Selected original scorecard"
      draggable={false}
      className="h-full w-full select-none object-contain touch-none"
      style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale}) rotate(${view.rotation}deg)` }}
    />
  </div>

  if (!file || !objectUrl) return <label
    className="mt-5 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-sky-300/35 bg-slate-950/35 p-6 text-center hover:border-sky-200"
    onDragOver={(event) => event.preventDefault()}
    onDrop={drop}
    data-testid="scorecard-drop-zone"
  >
    <strong>Drop a scorecard image here</strong>
    <span className="mt-1 text-sm text-slate-300">or click to select JPEG, PNG, WebP, or GIF · maximum 10 MB</span>
    <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={choose} aria-label="Select scorecard image" />
  </label>

  return <section className="mt-5 space-y-3" aria-label="Selected scorecard evidence">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><strong className="block">SCORECARD READY</strong><span className="text-sm text-slate-300">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB · drag the image to pan</span></div>
      {controls}
    </div>
    {image()}
    {lightbox && <div className="fixed inset-0 z-50 space-y-3 overflow-auto bg-slate-950/95 p-4" role="dialog" aria-modal="true" aria-label="Full-screen scorecard">
      <div className="flex flex-wrap items-center justify-between gap-3"><strong>{file.name}</strong><div className="flex flex-wrap gap-2">{controls}<button type="button" className="rounded-lg bg-white px-3 py-2 text-sm font-bold text-slate-950" onClick={() => setLightbox(false)}>Close</button></div></div>
      {image(true)}
    </div>}
  </section>
}
