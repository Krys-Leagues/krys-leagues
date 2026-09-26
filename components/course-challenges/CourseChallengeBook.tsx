"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { createDiscordAuthCallbackUrl } from "@/lib/authReturnTo"
import { supabase } from "@/lib/supabase"
import { isAceChallengeUnlocked, isPrestigeStageUnlocked } from "@/lib/courseChallenges/catalog"
import { isProfileDisplayRewardKey } from "@/lib/courseChallenges/rewards"
import type { CourseChallengeCourse, CourseChallengeDifficulty, CourseChallengeRequirement } from "@/lib/courseChallenges/types"
import styles from "./course-challenges.module.css"
import CourseChallengesGuide from "./CourseChallengesGuide"
import CourseChallengeRewardSelector from "./CourseChallengeRewardSelector"
import DiscordSignInButton from "@/components/auth/DiscordSignInButton"

type ProgressPayload = { completedLevels?: number[]; levelProgress?: Array<{ courseSlug?: string; level: number; easyStatus: string; hardStatus: string; completedAt: string | null; updatedAt: string | null }>; rewards?: Array<{ rewardKey: string; label: string; level: number | null; kind: "sticker" | "badge" }>; courses?: Array<{ slug: string; uniqueAceHoles?: number; completedAceStages?: number[]; completedPrestigeStages?: number[] }> }
type CatalogPayload = { available?: boolean; error?: string }
type SubmissionState = { challengeKey: "level" | "ace" | "prestige"; level: number; aceStage?: number; prestigeStage?: number; difficulty: CourseChallengeDifficulty }

export default function CourseChallengeBook({ course, autoOpen = false }: { course: CourseChallengeCourse; autoOpen?: boolean }) {
  const [completedLevels, setCompletedLevels] = useState<number[]>([])
  const [rewards, setRewards] = useState<ProgressPayload["rewards"]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [profileRewardMessage, setProfileRewardMessage] = useState("")
  const [submission, setSubmission] = useState<SubmissionState | null>(null)
  const [uniqueAceHoles, setUniqueAceHoles] = useState(0)
  const [completedAceStages, setCompletedAceStages] = useState<number[]>([])
  const [completedPrestigeStages, setCompletedPrestigeStages] = useState<number[]>([])
  const [bookPhase, setBookPhase] = useState<"closed" | "opening" | "open">(autoOpen ? "opening" : "closed")

  useEffect(() => {
    let active = true
    Promise.all([
      fetch("/api/course-challenges/catalog?slug=" + encodeURIComponent(course.slug), { cache: "no-store" }).then((response) => response.json() as Promise<CatalogPayload>),
      fetch("/api/course-challenges/profile?courseSlug=" + encodeURIComponent(course.slug), { cache: "no-store" }).then((response) => response.ok ? response.json() as Promise<ProgressPayload> : ({ completedLevels: [], rewards: [] })),
    ]).then(([catalog, profile]) => {
      if (!active) return
      setCompletedLevels(profile.completedLevels || [])
      setRewards(profile.rewards || [])
      const courseProfile = profile.courses?.find((item) => item.slug === course.slug)
      setUniqueAceHoles(courseProfile?.uniqueAceHoles || 0)
      setCompletedAceStages(courseProfile?.completedAceStages || [])
      setCompletedPrestigeStages(courseProfile?.completedPrestigeStages || [])
      if (catalog.error) setMessage(catalog.error)
    }).catch(() => { if (active) setMessage("Course data could not be loaded yet.") }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [course.slug])

  const rewardKeys = useMemo(() => new Set((rewards || []).map((reward) => reward.rewardKey)), [rewards])
  const maxCompleted = completedLevels.length ? Math.max(...completedLevels) : 0
  const currentLevel = useMemo(() => course.levels.find((level) => !completedLevels.includes(level.level))?.level || course.levels.length + 1, [completedLevels, course.levels])
  const aceUnlocked = isAceChallengeUnlocked(course, completedLevels)
  const aceStages = course.aceStages || []
  const currentAceStage = aceStages.find((stage) => !completedAceStages.includes(stage.stage)) || null
  const prestigeStages = course.prestigeStages || []
  const currentPrestigeStage = prestigeStages.find((stage) => !completedPrestigeStages.includes(stage.stage) && isPrestigeStageUnlocked(course, stage.stage, completedLevels, completedPrestigeStages)) || null
  const [selectedLevel, setSelectedLevel] = useState(1)
  const selectedLevelData = course.levels.find((level) => level.level === selectedLevel) || course.levels[0]

  useEffect(() => {
    if (loading) return
    const eligible = (rewards || []).filter((reward) => isProfileDisplayRewardKey(reward.rewardKey))
    if (!eligible.length) return

    const storageKey = "course-challenges-known-profile-rewards-" + course.slug
    let known: string[] = []
    try {
      const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "[]") as unknown
      known = Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []
    } catch {
      known = []
    }
    const newlyEarned = eligible.find((reward) => !known.includes(reward.rewardKey))
    // This state update is the user-visible result of reconciling browser storage with newly earned server rewards.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (newlyEarned) setProfileRewardMessage(newlyEarned.label)
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(Array.from(new Set([...known, ...eligible.map((reward) => reward.rewardKey)]))))
    } catch {
      // The reward remains owned even if browser storage is unavailable.
    }
  }, [course.slug, loading, rewards])

  return <main className={styles.page} style={{ "--course-background-image": course.backgroundImage ? "url(\"" + course.backgroundImage + "\")" : "none" } as React.CSSProperties}>
    <div className={styles.shell}>
      <div className={styles.backLinks}><Link href="/course-challenges" className={styles.backLink}>← Course Challenges</Link><DiscordSignInButton /><Link href={`/course-challenges/${course.slug}/community`} className={styles.backLink}>Who&apos;s taking on {course.name}? →</Link></div>
      <h1 className={styles.courseTitle}>{course.name}</h1>
      <div className={styles.book}>
        <details className={styles.rulesHelp}>
          <summary>Rules / Help</summary>
          <CourseChallengesGuide includeScorecardHelp />
        </details>
        {profileRewardMessage && <div className={styles.profileRewardNotice} role="status"><strong>NEW PROFILE REWARD UNLOCKED!</strong><span>You can now use {profileRewardMessage} on your Player Profile.</span></div>}
        {message && <p className={styles.notice}>{message}</p>}
        <div className={styles.bookStage} data-book-phase={bookPhase}>
          {bookPhase !== "open" && <button type="button" className={styles.bookCover} style={{ backgroundImage: course.backgroundImage ? "linear-gradient(90deg, #020617d9, #02061748), url(\"" + course.backgroundImage + "\")" : undefined }} disabled={bookPhase === "opening"} onClick={() => setBookPhase("opening")} onAnimationEnd={() => setBookPhase("open")}><span className={styles.bookCoverKicker}>KRYS&apos; LEAGUES</span><strong>COURSE CHALLENGE BOOK</strong><span>Open {course.name}</span></button>}
          <div className={styles.bookPages} aria-hidden={bookPhase !== "open"}>
          <div className={styles.bookSpread}>
          <aside className={styles.rewardPage} aria-label={course.name + " sticker and reward book"}>
            <div className={styles.bookPageHeading}><p className={styles.eyebrow}>STICKER &amp; REWARD BOOK</p><h2>Earned &amp; ahead</h2><p>Every reward stays with this course, from Level 1 through the final prestige rewards.</p></div>
            <div className={styles.rewardBookGrid}>
              {course.levels.map((level) => {
                const rewardState = rewardKeys.has(level.stickerKey) ? "earned" : level.level === currentLevel ? "current" : "locked"
                return <Reward key={level.stickerKey} rewardKey={level.stickerKey} label={"Level " + level.level + " sticker"} rewardState={rewardState} assetPath={level.stickerAsset} />
              })}
              {aceStages.map((stage) => <Reward key={stage.rewardKey} label={stage.label} rewardKey={stage.rewardKey} rewardState={rewardKeys.has(stage.rewardKey) ? "earned" : aceUnlocked && currentAceStage?.stage === stage.stage ? "current" : "locked"} assetPath={stage.rewardAsset} />)}
              <Reward rewardKey={"course-challenge:" + course.slug + ":course-pro"} label="Course Pro" rewardState={rewardKeys.has("course-challenge:" + course.slug + ":course-pro") ? "earned" : isPrestigeStageUnlocked(course, 1, completedLevels, completedPrestigeStages) ? "current" : "locked"} assetPath={course.courseProAsset || null} />
              <Reward rewardKey={"course-challenge:" + course.slug + ":course-master"} label="Course Master" rewardState={rewardKeys.has("course-challenge:" + course.slug + ":course-master") ? "earned" : isPrestigeStageUnlocked(course, 2, completedLevels, completedPrestigeStages) ? "current" : "locked"} assetPath={course.courseMasterAsset || null} />
            </div>
            <p className={styles.helper}>Progress currently recorded: Level {maxCompleted || 0} complete. Earned rewards can be selected for display in place of your avatar.</p>
            <CourseChallengeRewardSelector />
          </aside>
          <section className={styles.challengePage} aria-label={course.name + " current challenge page"}>
        <nav className={styles.levelRail} aria-label={course.name + " levels"}>
          {course.levels.map((level) => {
            const complete = completedLevels.includes(level.level)
            const locked = level.level > 1 && !completedLevels.includes(level.level - 1)
            return <button type="button" className={styles.levelTab} data-complete={complete} data-locked={locked} data-selected={selectedLevel === level.level} aria-current={selectedLevel === level.level ? "page" : undefined} key={level.level} onClick={() => setSelectedLevel(level.level)}><strong>Level {level.level}</strong><small>{complete ? "Complete" : locked ? "Locked" : "Available"}</small></button>
          })}
        </nav>
        {loading ? <p className={styles.helper}>Loading your Course Book…</p> : <section className={styles.levelCard + (selectedLevelData.level > 1 && !completedLevels.includes(selectedLevelData.level - 1) ? " " + styles.levelCardLocked : "")} aria-labelledby={"level-" + selectedLevelData.level + "-title"}>
          {(() => {
            const complete = completedLevels.includes(selectedLevelData.level)
            const locked = selectedLevelData.level > 1 && !completedLevels.includes(selectedLevelData.level - 1)
            return <>
              <div className={styles.levelHeader}><div><h2 id={"level-" + selectedLevelData.level + "-title"}>Level {selectedLevelData.level}</h2><p>{complete ? "Easy + Hard verified — Level complete" : locked ? "Complete Level " + (selectedLevelData.level - 1) + " to unlock this Level." : "You must complete and submit one Easy scorecard and one Hard scorecard for this Level."}</p></div><span className={styles.statusChip}>{complete ? "Complete" : locked ? "Locked" : "Open"}</span></div>
              {locked ? <div className={styles.lockedLevelView}><p className={styles.helper}>This Level is visible, but its challenge requirements stay hidden until it unlocks.</p><RewardStrip course={course} level={selectedLevelData.level} currentLevel={currentLevel} rewardKeys={rewardKeys} /></div> : <>
                <div className={styles.sideGrid}>
                  {(["Easy", "Hard"] as const).map((difficulty) => <ChallengeSide key={difficulty} course={course} difficulty={difficulty} requirements={difficulty === "Easy" ? selectedLevelData.easyRequirements : selectedLevelData.hardRequirements} requirementsPending={selectedLevelData.requirementsStatus === "pending_review"} onSubmit={() => setSubmission({ challengeKey: "level", level: selectedLevelData.level, difficulty })} />)}
                </div>
                {submission?.challengeKey === "level" && submission.level === selectedLevelData.level && <SubmissionForm course={course} level={selectedLevelData.level} challengeKey="level" difficulty={submission.difficulty} onCancel={() => setSubmission(null)} onSubmitted={(result) => { setMessage(result); setSubmission(null) }} />}
                <RewardStrip course={course} level={selectedLevelData.level} currentLevel={currentLevel} rewardKeys={rewardKeys} />
              </>}
            </>
          })()}
        </section>}
        {prestigeStages.length > 0 && <section className={styles.levelCard} aria-label="Course Pro and Course Master advanced challenges">
          <div className={styles.levelHeader}><div><h2>COURSE PRO &amp; COURSE MASTER</h2><p>Advanced challenges open after the regular Levels are complete.</p></div><span className={styles.statusChip}>{currentPrestigeStage ? currentPrestigeStage.label : completedPrestigeStages.length === prestigeStages.length ? "Complete" : "Locked"}</span></div>
          <div className={styles.aceStageRail}>{prestigeStages.map((stage) => { const complete = completedPrestigeStages.includes(stage.stage); const unlocked = isPrestigeStageUnlocked(course, stage.stage, completedLevels, completedPrestigeStages); return <div className={styles.aceStage} data-complete={complete} data-current={unlocked && !complete && currentPrestigeStage?.stage === stage.stage} key={stage.rewardKey}><strong>{stage.label}</strong><small>{complete ? "Complete" : unlocked && currentPrestigeStage?.stage === stage.stage ? stage.easyRequirements.map((item) => item.label).join(" · ") : "Locked — requirements hidden"}</small></div> })}</div>
          {currentPrestigeStage ? <><div className={styles.sideGrid}><ChallengeSide course={course} difficulty="Easy" requirements={currentPrestigeStage.easyRequirements} requirementsPending={currentPrestigeStage.requirementsStatus === "pending_review"} onSubmit={() => setSubmission({ challengeKey: "prestige", level: currentPrestigeStage.stage, prestigeStage: currentPrestigeStage.stage, difficulty: "Easy" })} /><ChallengeSide course={course} difficulty="Hard" requirements={currentPrestigeStage.hardRequirements} requirementsPending={currentPrestigeStage.requirementsStatus === "pending_review"} onSubmit={() => setSubmission({ challengeKey: "prestige", level: currentPrestigeStage.stage, prestigeStage: currentPrestigeStage.stage, difficulty: "Hard" })} /></div>{submission?.challengeKey === "prestige" && <SubmissionForm course={course} level={currentPrestigeStage.stage} challengeKey="prestige" prestigeStage={submission.prestigeStage} difficulty={submission.difficulty} onCancel={() => setSubmission(null)} onSubmitted={(result) => { setMessage(result); setSubmission(null) }} />}</> : <p className={styles.success}>{completedPrestigeStages.length === prestigeStages.length ? "Course Master complete — all advanced challenges are verified." : "Complete Level 5 to unlock Course Pro."}</p>}
        </section>}
        {aceStages.length > 0 && <section className={styles.levelCard} aria-label="Ace Track">
          <div className={styles.levelHeader}><div><h2>ACE TRACK</h2><p>Available from Level 1 · {uniqueAceHoles} of 9 unique ace holes</p></div><span className={styles.statusChip}>{aceUnlocked ? currentAceStage ? currentAceStage.label : "Complete" : "Unavailable"}</span></div>
          <div className={styles.aceStageRail}>{aceStages.map((stage) => <div className={styles.aceStage} data-complete={completedAceStages.includes(stage.stage)} data-current={aceUnlocked && currentAceStage?.stage === stage.stage} key={stage.rewardKey}><strong>{stage.label}</strong><small>{stage.easyRequirements[0]?.label}</small></div>)}</div>
          {!aceUnlocked ? <p className={styles.helper}>This course does not currently publish an Ace Track.</p> : currentAceStage ? <>
            <div className={styles.sideGrid}>
              <ChallengeSide course={course} difficulty="Easy" requirements={currentAceStage.easyRequirements} requirementsPending={currentAceStage.requirementsStatus === "pending_review"} onSubmit={() => setSubmission({ challengeKey: "ace", level: 3, aceStage: currentAceStage.stage, difficulty: "Easy" })} />
              <ChallengeSide course={course} difficulty="Hard" requirements={currentAceStage.hardRequirements} requirementsPending={currentAceStage.requirementsStatus === "pending_review"} onSubmit={() => setSubmission({ challengeKey: "ace", level: 3, aceStage: currentAceStage.stage, difficulty: "Hard" })} />
            </div>
            {submission?.challengeKey === "ace" && <SubmissionForm course={course} level={3} challengeKey="ace" aceStage={submission.aceStage} difficulty={submission.difficulty} onCancel={() => setSubmission(null)} onSubmitted={(result) => { setMessage(result); setSubmission(null) }} />}
          </> : <p className={styles.success}>Ace Legend complete — all 9 unique ace holes are in your verified track.</p>}
        </section>}
          </section>
        </div>
          </div>
        </div>
      </div>
    </div>
  </main>
}

function ChallengeSide({ course, difficulty, requirements, requirementsPending, onSubmit }: { course: CourseChallengeCourse; difficulty: CourseChallengeDifficulty; requirements: CourseChallengeRequirement[]; requirementsPending: boolean; onSubmit: () => void }) {
  const code = difficulty === "Easy" ? course.easyCode : course.hardCode
  return <article className={styles.sideCard}>
    <div className={styles.sideHeading}><h3>{difficulty} Course</h3><span>{code}</span></div>
    {requirementsPending ? <p>Final approved requirements are pending Krys review. An authorized admin reviews each submitted card.</p> : <ul className={styles.requirementList}>{requirements.map((requirement) => <li key={requirement.id}>{requirement.label}{requirement.reviewRequired && <small> · admin/photo review required</small>}{requirement.helpText && <details><summary>Optional PB tip</summary><small>{requirement.helpText}</small></details>}</li>)}</ul>}
    <button type="button" className={styles.submitButton} onClick={onSubmit}>Submit {difficulty} scorecard</button>
  </article>
}

type RewardState = "earned" | "current" | "locked"

function RewardStrip({ course, level, currentLevel, rewardKeys }: { course: CourseChallengeCourse; level: number; currentLevel: number; rewardKeys: Set<string> }) {
  const levelData = course.levels.find((item) => item.level === level)
  const levelKey = "course-challenge:" + course.slug + ":level-" + level + ":sticker"
  const badgeKey = "course-challenge:" + course.slug + ":level-" + level + ":badge"
  const rewardState = rewardKeys.has(levelKey) ? "earned" : level === currentLevel ? "current" : "locked"
  return <div className={styles.rewardStrip} aria-label={"Level " + level + " rewards"}>
    <Reward rewardKey={levelKey} label={"Level " + level + " sticker"} rewardState={rewardState} assetPath={levelData?.stickerAsset || null} />
    {levelData?.badgeKey && <Reward rewardKey={badgeKey} label={"Level " + level + " badge"} rewardState={rewardKeys.has(badgeKey) ? "earned" : rewardState} assetPath={levelData.badgeAsset} />}
  </div>
}

function Reward({ label, rewardKey, rewardState, assetPath }: { label: string; rewardKey: string; rewardState: RewardState; assetPath: string | null }) {
  const silhouetteStyle = assetPath ? { maskImage: "url('" + assetPath + "')", WebkitMaskImage: "url('" + assetPath + "')" } as React.CSSProperties : undefined
  const earned = rewardState === "earned"
  return <div className={styles.reward} data-earned={earned} data-reward-state={rewardState} data-reward-key={rewardKey}>{assetPath && rewardState === "earned" ? <Image src={assetPath} alt="" width={56} height={56} sizes="56px" /> : assetPath && rewardState === "current" ? <Image className={styles.rewardGhost} src={assetPath} alt="" width={56} height={56} sizes="56px" /> : earned ? <span className={styles.rewardMark} aria-hidden="true">✦</span> : <span className={styles.rewardSilhouette} style={silhouetteStyle} aria-hidden="true" />}<span>{label}</span></div>
}
function SubmissionForm({ course, level, challengeKey, aceStage, prestigeStage, difficulty, onCancel, onSubmitted }: { course: CourseChallengeCourse; level: number; challengeKey: "level" | "ace" | "prestige"; aceStage?: number; prestigeStage?: number; difficulty: CourseChallengeDifficulty; onCancel: () => void; onSubmitted: (message: string) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  function chooseFile(next: File | null) {
    if (!next) return
    if (!next.type.startsWith("image/")) { setError("Choose an image file for the scorecard."); return }
    if (preview) URL.revokeObjectURL(preview)
    setFile(next)
    setPreview(URL.createObjectURL(next))
    setError("")
  }

  async function submit() {
    setError("")
    if (!file || !preview) { setError("Add your scorecard photo first."); return }
    setBusy(true)
    try {
      const userResult = await supabase.auth.getUser()
      if (!userResult.data.user) { await supabase.auth.signInWithOAuth({ provider: "discord", options: { redirectTo: createDiscordAuthCallbackUrl("player") } }); return }
      const extension = file.name.split(".").at(-1)?.replace(/[^a-z0-9]/gi, "") || "jpg"
      const storagePath = userResult.data.user.id + "/" + course.slug + "/" + challengeKey + "-" + level + "-" + difficulty + "-" + crypto.randomUUID() + "." + extension
      const upload = await supabase.storage.from("course-challenge-proof").upload(storagePath, file, { contentType: file.type || "image/jpeg", upsert: false })
      if (upload.error) throw new Error("Proof photo upload failed: " + upload.error.message)
      const response = await fetch("/api/course-challenges/submissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseSlug: course.slug, level, challengeKey, aceStage, prestigeStage, difficulty, proofPhotoPath: storagePath }) })
      const payload = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(payload.error || "Course Challenge submission failed.")
      onSubmitted(payload.message || "Scorecard submitted — waiting for admin approval.")
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Course Challenge submission failed.") } finally { setBusy(false) }
  }

  const challengeLabel = challengeKey === "ace" ? "ACE TRACK" : challengeKey === "prestige" ? (prestigeStage === 1 ? "COURSE PRO" : "COURSE MASTER") : "LEVEL " + level
  return <section className={styles.submissionPanel} aria-label={challengeLabel + " " + difficulty + " scorecard submission"}>
    <div><p className={styles.eyebrow}>{challengeLabel} · {difficulty.toUpperCase()}</p><h3>Submit your scorecard photo</h3><p className={styles.helper}>Upload a clear current scorecard with the date, time, and game mode visible. Your submission will be reviewed by an admin.</p></div>
      <details className={styles.formHelp}><summary>Rules / Help</summary><p>Drag your scorecard photo here or tap to choose one. Make sure all scorecard details, including the date, time, and game mode, are visible and readable. Recommended: crop the photo so the scorecard fills the image.</p></details>
    <div className={styles.dropZone + (dragActive ? " " + styles.dropZoneActive : "")} role="button" tabIndex={0} onClick={() => fileInputRef.current?.click()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileInputRef.current?.click() } }} onDragEnter={(event) => { event.preventDefault(); setDragActive(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragActive(false)} onDrop={(event) => { event.preventDefault(); setDragActive(false); chooseFile(event.dataTransfer.files?.[0] || null) }}>
      <input ref={fileInputRef} className={styles.hiddenFileInput} type="file" accept="image/*" onChange={(event) => chooseFile(event.target.files?.[0] || null)} />
      {preview ? <div className={styles.dropPreview}><img className={styles.photoPreview} src={preview} alt="Selected scorecard preview" /><div className={styles.dropPreviewActions}><strong>Scorecard photo selected</strong><button type="button" className={styles.secondaryButton} onClick={(event) => { event.stopPropagation(); fileInputRef.current?.click() }}>REPLACE / CHANGE</button></div></div> : <><strong>DRAG YOUR SCORECARD HERE</strong><span>or tap to choose a photo</span></>}
    </div>
    <p className={styles.helper}>One current scorecard photo is required for this challenge. The same card cannot be reused for another submission in the same track.</p>
    {error && <p className={styles.notice}>{error}</p>}
    <div className={styles.buttonRow}><button type="button" className={styles.submitButton} onClick={() => void submit()} disabled={busy}>{busy ? "SUBMITTING…" : "SUBMIT SCORECARD"}</button><button type="button" className={styles.secondaryButton} onClick={onCancel} disabled={busy}>CANCEL</button></div>
  </section>
}
