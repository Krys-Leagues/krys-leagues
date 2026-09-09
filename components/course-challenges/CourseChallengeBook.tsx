"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { createDiscordAuthCallbackUrl } from "@/lib/authReturnTo"
import { supabase } from "@/lib/supabase"
import { isAceChallengeUnlocked } from "@/lib/courseChallenges/catalog"
import { calculateCourseChallengeMetrics, validHolePars, validHoleScores } from "@/lib/courseChallenges/evaluation"
import { isProfileDisplayRewardKey } from "@/lib/courseChallenges/rewards"
import type { CourseChallengeCourse, CourseChallengeDifficulty, CourseChallengeRequirement } from "@/lib/courseChallenges/types"
import scorecardStyles from "@/components/admin/records/NormalScorecard.module.css"
import styles from "./course-challenges.module.css"
import CourseChallengesGuide from "./CourseChallengesGuide"
import CourseChallengeRewardSelector from "./CourseChallengeRewardSelector"

type ProgressPayload = { completedLevels?: number[]; rewards?: Array<{ rewardKey: string; label: string; level: number | null; kind: "sticker" | "badge" }> }
type CatalogPayload = { pars?: Partial<Record<CourseChallengeDifficulty, number[]>>; available?: boolean; error?: string }
type SubmissionState = { challengeKey: "level" | "ace"; level: number; difficulty: CourseChallengeDifficulty }

export default function CourseChallengeBook({ course }: { course: CourseChallengeCourse }) {
  const [completedLevels, setCompletedLevels] = useState<number[]>([])
  const [rewards, setRewards] = useState<ProgressPayload["rewards"]>([])
  const [pars, setPars] = useState<CatalogPayload["pars"]>({})
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [profileRewardMessage, setProfileRewardMessage] = useState("")
  const [submission, setSubmission] = useState<SubmissionState | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([
      fetch("/api/course-challenges/catalog?slug=" + encodeURIComponent(course.slug), { cache: "no-store" }).then((response) => response.json() as Promise<CatalogPayload>),
      fetch("/api/course-challenges/profile?courseSlug=" + encodeURIComponent(course.slug), { cache: "no-store" }).then((response) => response.ok ? response.json() as Promise<ProgressPayload> : ({ completedLevels: [], rewards: [] })),
    ]).then(([catalog, profile]) => {
      if (!active) return
      setPars(catalog.pars || {})
      setCompletedLevels(profile.completedLevels || [])
      setRewards(profile.rewards || [])
      if (catalog.error) setMessage(catalog.error)
    }).catch(() => { if (active) setMessage("Course data could not be loaded yet.") }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [course.slug])

  const rewardKeys = useMemo(() => new Set((rewards || []).map((reward) => reward.rewardKey)), [rewards])
  const maxCompleted = completedLevels.length ? Math.max(...completedLevels) : 0
  const currentLevel = useMemo(() => course.levels.find((level) => !completedLevels.includes(level.level))?.level || course.levels.length + 1, [completedLevels, course.levels])
  const aceUnlocked = isAceChallengeUnlocked(course, completedLevels)
  const ace = course.aceChallenge
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
      <Link href="/course-challenges" className={styles.backLink}>← Course Challenges</Link>
      <h1 className={styles.courseTitle}>{course.name}</h1>
      <div className={styles.book}>
        <details className={styles.rulesHelp}>
          <summary>Rules / Help</summary>
          <CourseChallengesGuide includeScorecardHelp />
        </details>
        {profileRewardMessage && <div className={styles.profileRewardNotice} role="status"><strong>NEW PROFILE REWARD UNLOCKED!</strong><span>You can now use {profileRewardMessage} on your Player Profile.</span></div>}
        {message && <p className={styles.notice}>{message}</p>}
        <nav className={styles.levelRail} aria-label={course.name + " levels"}>
          {course.levels.map((level) => {
            const complete = completedLevels.includes(level.level)
            const locked = level.level > 1 && !completedLevels.includes(level.level - 1)
            return <button type="button" className={styles.levelTab} data-complete={complete} data-locked={locked} data-selected={selectedLevel === level.level} aria-current={selectedLevel === level.level ? "page" : undefined} key={level.level} onClick={() => setSelectedLevel(level.level)}><strong>Level {level.level}</strong><small>{complete ? "Complete" : locked ? "Locked" : "Available"}</small></button>
          })}
        </nav>
        {loading ? <p className={styles.helper}>Loading authoritative pars and your Course Book…</p> : <section className={styles.levelCard + (selectedLevelData.level > 1 && !completedLevels.includes(selectedLevelData.level - 1) ? " " + styles.levelCardLocked : "")} aria-labelledby={"level-" + selectedLevelData.level + "-title"}>
          {(() => {
            const complete = completedLevels.includes(selectedLevelData.level)
            const locked = selectedLevelData.level > 1 && !completedLevels.includes(selectedLevelData.level - 1)
            return <>
              <div className={styles.levelHeader}><div><h2 id={"level-" + selectedLevelData.level + "-title"}>Level {selectedLevelData.level}</h2><p>{complete ? "Easy + Hard verified — Level complete" : locked ? "Complete Level " + (selectedLevelData.level - 1) + " to unlock this Level." : "You must complete and submit one Easy scorecard and one Hard scorecard for this Level."}</p></div><span className={styles.statusChip}>{complete ? "Complete" : locked ? "Locked" : "Open"}</span></div>
              {locked ? <div className={styles.lockedLevelView}><p className={styles.helper}>This Level is visible, but its challenge requirements stay hidden until it unlocks.</p><RewardStrip course={course} level={selectedLevelData.level} currentLevel={currentLevel} rewardKeys={rewardKeys} /></div> : <>
                <div className={styles.sideGrid}>
                  {(["Easy", "Hard"] as const).map((difficulty) => <ChallengeSide key={difficulty} course={course} difficulty={difficulty} requirements={difficulty === "Easy" ? selectedLevelData.easyRequirements : selectedLevelData.hardRequirements} requirementsPending={selectedLevelData.requirementsStatus === "pending_review"} onSubmit={() => setSubmission({ challengeKey: "level", level: selectedLevelData.level, difficulty })} />)}
                </div>
                {submission?.challengeKey === "level" && submission.level === selectedLevelData.level && <SubmissionForm course={course} level={selectedLevelData.level} challengeKey="level" difficulty={submission.difficulty} pars={pars?.[submission.difficulty] || null} onCancel={() => setSubmission(null)} onSubmitted={(result) => { setMessage(result); setSubmission(null) }} />}
                <RewardStrip course={course} level={selectedLevelData.level} currentLevel={currentLevel} rewardKeys={rewardKeys} />
              </>}
            </>
          })()}
        </section>}
        {selectedLevelData.level === (ace?.unlockAfterLevel || 3) && ace && <section className={styles.levelCard} aria-label="Ace Challenge">
          <div className={styles.levelHeader}><div><h2>ACE CHALLENGE</h2><p>Unlocks after Level {ace.unlockAfterLevel}</p></div><span className={styles.statusChip}>{aceUnlocked ? "Unlocked" : "Locked"}</span></div>
          {!aceUnlocked ? <p className={styles.helper}>Complete Level 3 to reveal the Ace Challenge requirements. The requirements stay hidden until then.</p> : <>
            <div className={styles.sideGrid}>
              <ChallengeSide course={course} difficulty="Easy" requirements={ace.easyRequirements} requirementsPending={ace.requirementsStatus === "pending_review"} onSubmit={() => setSubmission({ challengeKey: "ace", level: ace.unlockAfterLevel, difficulty: "Easy" })} />
              <ChallengeSide course={course} difficulty="Hard" requirements={ace.hardRequirements} requirementsPending={ace.requirementsStatus === "pending_review"} onSubmit={() => setSubmission({ challengeKey: "ace", level: ace.unlockAfterLevel, difficulty: "Hard" })} />
            </div>
            {submission?.challengeKey === "ace" && <SubmissionForm course={course} level={ace.unlockAfterLevel} challengeKey="ace" difficulty={submission.difficulty} pars={pars?.[submission.difficulty] || null} onCancel={() => setSubmission(null)} onSubmitted={(result) => { setMessage(result); setSubmission(null) }} />}
          </>}
          <Reward label="Ace Challenge badge" rewardKey={ace.rewardKey} rewardState={rewardKeys.has(ace.rewardKey) ? "earned" : aceUnlocked ? "current" : "locked"} assetPath={ace.rewardAsset} />
        </section>}
        <section className={styles.levelCard} aria-label="Major Course Challenge rewards">
          <div className={styles.levelHeader}><div><h2>Prestige rewards</h2><p>Earned Course Challenge rewards can be selected for display in place of your avatar.</p></div></div>
          <div className={styles.rewardStrip}>
            <Reward rewardKey={"course-challenge:" + course.slug + ":course-pro"} label="Course Pro" rewardState={rewardKeys.has("course-challenge:" + course.slug + ":course-pro") ? "earned" : currentLevel === 3 ? "current" : "locked"} assetPath={course.courseProAsset || null} />
            <Reward rewardKey={"course-challenge:" + course.slug + ":course-master"} label="Course Master" rewardState={rewardKeys.has("course-challenge:" + course.slug + ":course-master") ? "earned" : currentLevel === 5 ? "current" : "locked"} assetPath={course.courseMasterAsset || null} />
          </div>
          <p className={styles.helper}>Only earned rewards become selectable. Progress currently recorded: Level {maxCompleted || 0} complete.</p>
          <CourseChallengeRewardSelector />
        </section>
      </div>
    </div>
  </main>
}

function ChallengeSide({ course, difficulty, requirements, requirementsPending, onSubmit }: { course: CourseChallengeCourse; difficulty: CourseChallengeDifficulty; requirements: CourseChallengeRequirement[]; requirementsPending: boolean; onSubmit: () => void }) {
  const code = difficulty === "Easy" ? course.easyCode : course.hardCode
  return <article className={styles.sideCard}>
    <div className={styles.sideHeading}><h3>{difficulty} Course</h3><span>{code}</span></div>
    {requirementsPending ? <p>Final approved requirements are pending Krys review. The scorecard flow is wired, but automatic challenge approval remains off.</p> : <ul className={styles.requirementList}>{requirements.map((requirement) => <li key={requirement.id}>{requirement.label}{requirement.reviewRequired && <small> · admin/photo review required</small>}{requirement.helpText && <details><summary>Optional PB tip</summary><small>{requirement.helpText}</small></details>}</li>)}</ul>}
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
function SubmissionForm({ course, level, challengeKey, difficulty, pars, onCancel, onSubmitted }: { course: CourseChallengeCourse; level: number; challengeKey: "level" | "ace"; difficulty: CourseChallengeDifficulty; pars: number[] | null; onCancel: () => void; onSubmitted: (message: string) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [scores, setScores] = useState<string[]>(Array.from({ length: 18 }, () => ""))

  const [dragActive, setDragActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const scoreRefs = useRef<Array<HTMLInputElement | null>>([])
  const submitButtonRef = useRef<HTMLButtonElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const advanceTimers = useRef<Array<number | undefined>>([])

  useEffect(() => () => {
    advanceTimers.current.forEach((timer) => { if (timer) window.clearTimeout(timer) })
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

  function focusNext(index: number) {
    if (index === 17) submitButtonRef.current?.focus()
    else scoreRefs.current[index + 1]?.focus()
  }

  function scheduleAdvance(index: number, value: string) {
    if (advanceTimers.current[index]) window.clearTimeout(advanceTimers.current[index])
    if (!value) return
    const delay = value.length >= 2 || value !== "1" ? 180 : 650
    advanceTimers.current[index] = window.setTimeout(() => focusNext(index), delay)
  }

  function changeScore(index: number, raw: string) {
    const value = raw.replace(/[^0-9]/g, "").slice(0, 2)
    setScores((old) => old.map((current, item) => item === index ? value : current))
    scheduleAdvance(index, value)
  }

  const numericScores = useMemo(() => scores.map((value) => Number(value)), [scores])
  const calculatedFinalScore = useMemo(() => {
    if (!pars || !validHolePars(pars) || !validHoleScores(numericScores)) return null
    return calculateCourseChallengeMetrics(numericScores, pars).relativeToPar
  }, [numericScores, pars])

  function handleScoreKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !scores[index] && index > 0) {
      event.preventDefault()
      scoreRefs.current[index - 1]?.focus()
      return
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault()
      focusNext(index)
    }
  }

  async function submit() {
    setError("")
    if (!file || !preview) { setError("Add your scorecard photo first."); return }
    if (!pars || pars.length !== 18) { setError("Authoritative pars are unavailable; submission is blocked until the course catalog is available."); return }
    const numericScores = scores.map((value) => Number(value))
    if (numericScores.some((value) => !Number.isInteger(value) || value < 1)) { setError("Enter a positive whole-number score for all 18 holes."); return }
    if (!validHoleScores(numericScores) || calculatedFinalScore === null) { setError("Enter a positive whole-number score for all 18 holes."); return }
    setBusy(true)
    try {
      const userResult = await supabase.auth.getUser()
      if (!userResult.data.user) { await supabase.auth.signInWithOAuth({ provider: "discord", options: { redirectTo: createDiscordAuthCallbackUrl("player") } }); return }
      const extension = file.name.split(".").at(-1)?.replace(/[^a-z0-9]/gi, "") || "jpg"
      const storagePath = userResult.data.user.id + "/" + course.slug + "/" + challengeKey + "-" + level + "-" + difficulty + "-" + crypto.randomUUID() + "." + extension
      const upload = await supabase.storage.from("course-challenge-proof").upload(storagePath, file, { contentType: file.type || "image/jpeg", upsert: false })
      if (upload.error) throw new Error("Proof photo upload failed: " + upload.error.message)
      const response = await fetch("/api/course-challenges/submissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseSlug: course.slug, level, challengeKey, difficulty, proofPhotoPath: storagePath, scores: numericScores, finalScore: calculatedFinalScore }) })
      const payload = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(payload.error || "Course Challenge submission failed.")
      onSubmitted(payload.message || "Scorecard received for review.")
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Course Challenge submission failed.") } finally { setBusy(false) }
  }

  return <section className={styles.submissionPanel} aria-label={(challengeKey === "ace" ? "Ace Challenge" : "Level " + level) + " " + difficulty + " scorecard submission"}>
    <div><p className={styles.eyebrow}>{challengeKey === "ace" ? "ACE CHALLENGE" : "LEVEL " + level} · {difficulty.toUpperCase()}</p><h3>Upload your scorecard, then enter the scores</h3></div>
    <details className={styles.formHelp}><summary>Rules / Help</summary><p>Drag your scorecard photo here or tap to choose one. The scorecard numbers and final score should be clearly readable. Recommended: crop the photo so the scorecard fills the image.</p><p>Do not type the date, time, or Game Mode. The submission records its server time, and an admin can review the scorecard photo when date/time or Solo/Multiplayer evidence is unclear. Solo and Multiplayer are eligible; Practice Mode is not.</p></details>
    <div className={styles.dropZone + (dragActive ? " " + styles.dropZoneActive : "")} role="button" tabIndex={0} onClick={() => fileInputRef.current?.click()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileInputRef.current?.click() } }} onDragEnter={(event) => { event.preventDefault(); setDragActive(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragActive(false)} onDrop={(event) => { event.preventDefault(); setDragActive(false); chooseFile(event.dataTransfer.files?.[0] || null) }}>
      <input ref={fileInputRef} className={styles.hiddenFileInput} type="file" accept="image/*" onChange={(event) => chooseFile(event.target.files?.[0] || null)} />
      {preview ? <div className={styles.dropPreview}><img className={styles.photoPreview} src={preview} alt="Selected scorecard preview" /><div className={styles.dropPreviewActions}><strong>Scorecard photo selected</strong><button type="button" className={styles.secondaryButton} onClick={(event) => { event.stopPropagation(); fileInputRef.current?.click() }}>Replace / Change</button></div></div> : <><strong>DRAG YOUR SCORECARD HERE</strong><span>or tap to choose a photo</span></>}
    </div>
    <p className={styles.helper}>Recommended: crop the photo so the scorecard fills the image. Cropping is optional.</p>
    <div className={scorecardStyles.scorecardScroller} aria-label="H1 through H18 score entry"><table className={scorecardStyles.scorecard} data-testid="course-challenge-scorecard"><thead><tr><th scope="row">HOLE</th>{scores.map((_, index) => <th key={index} scope="col">{index + 1}</th>)}</tr><tr><th scope="row">PAR</th>{scores.map((_, index) => <td className={scorecardStyles.parCell} key={index}>{pars?.[index] ?? "—"}</td>)}</tr></thead><tbody><tr><th scope="row">SCORE</th>{scores.map((value, index) => <td key={index}><input ref={(element) => { scoreRefs.current[index] = element }} className={scorecardStyles.scoreInput} data-course-challenge-hole-index={index} inputMode="numeric" pattern="[0-9]*" min={1} max={99} maxLength={2} value={value} onChange={(event) => changeScore(index, event.target.value)} onKeyDown={(event) => handleScoreKeyDown(index, event)} aria-label={"Hole " + (index + 1) + " score"} /></td>)}</tr></tbody></table><p className={scorecardStyles.scorecardHint}>HOLE · PAR · SCORE — all 18 holes stay in one compact scorecard row. Scores advance after each valid entry; two-digit scores are supported.</p></div>
    <div className={styles.calculatedScore} tabIndex={-1} aria-live="polite" aria-label="Calculated final score"><span>CALCULATED FINAL SCORE</span><strong>{calculatedFinalScore === null ? "—" : calculatedFinalScore > 0 ? "+" + calculatedFinalScore : calculatedFinalScore}</strong><small>Make sure this matches the final score on your scorecard before submitting.</small></div>
    {error && <p className={styles.notice}>{error}</p>}
    <div className={styles.buttonRow}><button type="button" className={styles.secondaryButton} onClick={onCancel} disabled={busy}>Cancel</button><button ref={submitButtonRef} type="button" className={styles.submitButton} onClick={() => void submit()} disabled={busy}>{busy ? "Submitting…" : "Submit scorecard"}</button></div>
  </section>
}
