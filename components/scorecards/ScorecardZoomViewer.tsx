"use client"

import { useRef, useState, type PointerEvent } from "react"

export type ScorecardImageView = { scale: number; rotation: number; x: number; y: number }

export const SCORECARD_FIT_VIEW: ScorecardImageView = { scale: 1, rotation: 0, x: 0, y: 0 }

export function useScorecardImageView() {
  const [view, setView] = useState<ScorecardImageView>(SCORECARD_FIT_VIEW)
  const dragOrigin = useRef<{ pointerX: number; pointerY: number; imageX: number; imageY: number } | null>(null)

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

  function endPan(event: PointerEvent<HTMLDivElement>) {
    dragOrigin.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return {
    view,
    zoomIn: () => setView((current) => ({ ...current, scale: Math.min(4, current.scale + 0.25) })),
    zoomOut: () => setView((current) => ({ ...current, scale: Math.max(0.5, current.scale - 0.25) })),
    reset: () => setView(SCORECARD_FIT_VIEW),
    rotate: () => setView((current) => ({ ...current, rotation: (current.rotation + 90) % 360 })),
    panHandlers: {
      onPointerDown: startPan,
      onPointerMove: pan,
      onPointerUp: endPan,
      onPointerCancel: () => { dragOrigin.current = null },
    },
  }
}

type ScorecardImageController = ReturnType<typeof useScorecardImageView>

export function ScorecardZoomControls({ controller, buttonClassName }: { controller: ScorecardImageController; buttonClassName?: string }) {
  return <>
    <button type="button" className={buttonClassName} onClick={controller.zoomIn}>Zoom in</button>
    <button type="button" className={buttonClassName} onClick={controller.zoomOut}>Zoom out</button>
    <button type="button" className={buttonClassName} onClick={controller.reset}>Fit / reset</button>
    <button type="button" className={buttonClassName} onClick={controller.rotate}>Rotate</button>
  </>
}

export function ScorecardPanViewport({ controller, src, alt, className, imageClassName, testId }: {
  controller: ScorecardImageController
  src: string
  alt: string
  className?: string
  imageClassName?: string
  testId?: string
}) {
  return <div className={className} data-testid={testId} {...controller.panHandlers}>
    {/* eslint-disable-next-line @next/next/no-img-element -- private scorecard evidence must retain its original source resolution */}
    <img
      src={src}
      alt={alt}
      draggable={false}
      className={imageClassName}
      style={{ transform: `translate(${controller.view.x}px, ${controller.view.y}px) scale(${controller.view.scale}) rotate(${controller.view.rotation}deg)` }}
    />
  </div>
}
