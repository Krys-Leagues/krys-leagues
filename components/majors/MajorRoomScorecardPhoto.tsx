"use client"

import Image from "next/image"
import { useCallback, useEffect, useRef, useState } from "react"

import { ScorecardPanViewport, ScorecardZoomControls, useScorecardImageView } from "@/components/scorecards/ScorecardZoomViewer"
import type { MajorRoomScorecardPayload } from "@/lib/majorRoomScorecard"
import styles from "./MajorRoomScorecardPhoto.module.css"

const ACCEPTED_IMAGES = "image/jpeg,image/png,image/webp,image/gif"

function PhotoIssueNotice() {
  return (
    <div className={styles.photoIssue} role="note">
      <strong>ROOM SCORECARD PHOTO ISSUE</strong>
      <p>You can still enter and submit your 18-hole scores.</p>
      <p>Keep your Room Scorecard photo. An admin must receive or see it for verification. If the shared upload is not working, send the scorecard to an admin or use the backup method provided by the admins.</p>
    </div>
  )
}

export default function MajorRoomScorecardPhoto({ playDayId }: { playDayId: string }) {
  const [payload, setPayload] = useState<MajorRoomScorecardPayload | null>(null)
  const [eligible, setEligible] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [photoIssue, setPhotoIssue] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const previewButton = useRef<HTMLButtonElement | null>(null)
  const closeButton = useRef<HTMLButtonElement | null>(null)
  const imageView = useScorecardImageView()

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/majors/room-scorecard?${new URLSearchParams({ playDayId })}`, { cache: "no-store" })
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        setEligible(false)
        setPayload(null)
        setPhotoIssue(true)
        return
      }
      const body = await response.json() as MajorRoomScorecardPayload & { error?: string }
      if (!response.ok) {
        setMessage(body.error || "The room scorecard could not be loaded.")
        setPhotoIssue(true)
        return
      }
      setEligible(true)
      setPayload(body)
      setPhotoIssue(false)
    } catch {
      setMessage("The room scorecard could not be loaded.")
      setPhotoIssue(true)
    } finally {
      setLoaded(true)
    }
  }, [playDayId])

  useEffect(() => {
    // Load the current shared proof for the selected published round.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  useEffect(() => {
    if (!expanded) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeExpanded()
    }
    window.addEventListener("keydown", closeOnEscape)
    window.requestAnimationFrame(() => closeButton.current?.focus())
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [expanded])

  function closeExpanded() {
    setExpanded(false)
    window.requestAnimationFrame(() => previewButton.current?.focus())
  }

  async function upload(file: File | undefined, replace: boolean) {
    if (!file || !payload) return
    if (replace && !window.confirm("Replace the current shared room scorecard photo? The previous proof remains in the audit history.")) return

    setBusy(true)
    setMessage("")
    const form = new FormData()
    form.set("playDayId", playDayId)
    form.set("scorecard", file)
    form.set("action", replace ? "replace" : "upload")
    if (replace && payload.proof) form.set("expectedProofId", payload.proof.id)
    const response = await fetch("/api/majors/room-scorecard", { method: "POST", body: form })
    const body = await response.json() as { error?: string }
    setBusy(false)
    if (!response.ok) {
      setMessage(body.error || "The room scorecard photo could not be saved.")
      setPhotoIssue(true)
      return
    }
    setMessage(replace ? "Shared room scorecard photo replaced." : "Shared room scorecard photo submitted.")
    await load()
  }

  if (!loaded) return null

  if (!eligible || !payload) {
    return (
      <section className={styles.panel} aria-label="Room scorecard photo status">
        <PhotoIssueNotice />
        {message && <p className={styles.message} role="status">{message}</p>}
      </section>
    )
  }

  return (
    <section className={styles.panel} aria-labelledby={`room-scorecard-${playDayId}`}>
      <div className={styles.heading}>
        <div>
          <p>SHARED ROOM PROOF</p>
          <h2 id={`room-scorecard-${playDayId}`}>ROOM SCORECARD</h2>
          <span>{payload.context.group_label} · one photo shared by the whole room</span>
        </div>
        {payload.proof && <small>Uploaded {new Date(payload.proof.uploaded_at).toLocaleString()}</small>}
      </div>

      {payload.proof ? (
        <>
          <button
            ref={previewButton}
            type="button"
            className={styles.previewButton}
            onClick={() => setExpanded(true)}
            aria-label="Enlarge shared room scorecard"
          >
            <Image
              key={payload.proof.image_url}
              src={payload.proof.image_url}
              alt={`Shared scorecard for ${payload.context.group_label}`}
              width={1400}
              height={900}
              sizes="(max-width: 900px) 100vw, 1000px"
              loading="eager"
              unoptimized
              onError={() => setPhotoIssue(true)}
            />
            <span>VIEW SCORECARD</span>
          </button>
          <div className={styles.proofActions}>
            <p className={styles.help}>This one photo is shared with every assigned player. Enter and submit only your own 18-hole score below.</p>
            <label className={styles.secondaryAction} aria-disabled={busy}>
              {busy ? "SAVING…" : "REPLACE ROOM SCORECARD PHOTO"}
              <input type="file" accept={ACCEPTED_IMAGES} disabled={busy} onChange={(event) => void upload(event.target.files?.[0], true)} />
            </label>
          </div>
          {expanded && (
            <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby={`room-scorecard-expanded-${playDayId}`} onClick={(event) => { if (event.currentTarget === event.target) closeExpanded() }}>
              <div className={styles.modalCard}>
                <div className={styles.modalHeading}>
                  <h2 id={`room-scorecard-expanded-${playDayId}`}>{payload.context.group_label} ROOM SCORECARD</h2>
                  <div className={styles.modalControls} aria-label="Scorecard image controls">
                    <ScorecardZoomControls controller={imageView} buttonClassName={styles.modalControl} />
                  </div>
                  <button ref={closeButton} type="button" className={styles.modalClose} onClick={closeExpanded} aria-label="Close enlarged scorecard">×</button>
                </div>
                <ScorecardPanViewport
                  controller={imageView}
                  src={payload.proof.image_url}
                  alt={`Enlarged shared scorecard for ${payload.context.group_label}`}
                  className={styles.modalImageFrame}
                  imageClassName={styles.modalImage}
                  testId="masters-room-scorecard-viewer"
                />
              </div>
            </div>
          )}
        </>
      ) : (
        <div className={styles.empty}>
          <strong>No room scorecard has been uploaded yet.</strong>
          <p>Any player assigned to this complete published room may upload the shared scorecard photo.</p>
          <PhotoIssueNotice />
          <label className={styles.primaryAction} aria-disabled={busy}>
            {busy ? "UPLOADING…" : "SUBMIT ROOM SCORECARD PHOTO"}
            <input type="file" accept={ACCEPTED_IMAGES} disabled={busy} onChange={(event) => void upload(event.target.files?.[0], false)} />
          </label>
        </div>
      )}
      {photoIssue && payload.proof && <PhotoIssueNotice />}
      {message && <p className={styles.message} role="status">{message}</p>}
    </section>
  )
}
