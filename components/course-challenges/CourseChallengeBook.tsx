"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { createDiscordAuthCallbackUrl } from "@/lib/authReturnTo"
import { supabase } from "@/lib/supabase"
import { isAceChallengeUnlocked } from "@/lib/courseChallenges/catalog"
import type { CourseChallengeCourse, CourseChallengeDifficulty, CourseChallengeRequirement } from "@/lib/courseChallenges/types"
import styles from "./course-challenges.module.css"
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
  const aceUnlocked = isAceChallengeUnlocked(course, completedLevels)
  const ace = course.aceChallenge

  return <main className={styles.page}>
    <div className={styles.shell}>
      <Link href="/course-challenges" className={styles.backLink}>← Course Challenges</Link>
      <header className={styles.courseHero} style={course.backgroundImage ? { backgroundImage: 'url("' + course.backgroundImage + '")' } : undefined}>
        <div className={styles.courseHeroCopy}>
          <p className={styles.eyebrow}>COURSE CHALLENGE BOOK</p>
          <h1>{course.name}</h1>
          <p>Levels 1–5 are visible together. Each Level has two required sides: Easy Course and Hard Course.</p>
        </div>
      </header>
      <div className={styles.book}>
        <details className={styles.rulesHelp}>
          <summary>Rules / Help</summary>
          <p>You must complete and submit one Easy scorecard and one Hard scorecard for each Level. Solo and Multiplayer Game Mode rounds qualify; Practice Mode does not. All requirements for one difficulty and one Level come from the same complete 18-hole card.</p>
          <p>The scorecard photo must show the round date and time. If you do not see the date and time on your scorecard, tap the three dots in the bottom-right BEFORE taking your picture.</p>
          <p>We ask for both the scorecard photo and your 18 hole scores so we can check your round right away. That helps unlock your next Level without making you wait for an admin, while keeping Course Challenge results accurate.</p>
        </details>
        {message && <p className={styles.notice}>{message}</p>}
        <div className={styles.levelRail} aria-label={course.name + " levels"}>
          {course.levels.map((level) => {
            const complete = completedLevels.includes(level.level)
            const locked = level.level > 1 && !completedLevels.includes(level.level - 1)
            return <div className={styles.levelTab} data-complete={complete} data-locked={locked} key={level.level}><strong>Level {level.level}</strong><small>{complete ? "Complete" : locked ? "Locked" : "Available"}</small></div>
          })}
        </div>
        {loading ? <p className={styles.helper}>Loading authoritative pars and your Course Book…</p> : course.levels.map((level) => {
          const complete = completedLevels.includes(level.level)
          const locked = level.level > 1 && !completedLevels.includes(level.level - 1)
          return <section className={styles.levelCard + (locked ? " " + styles.levelCardLocked : "")} key={level.level} aria-labelledby={"level-" + level.level + "-title"}>
            <div className={styles.levelHeader}><div><h2 id={"level-" + level.level + "-title"}>Level {level.level}</h2><p>{complete ? "Easy + Hard verified — Level complete" : locked ? "Complete the previous Level to unlock this one." : "You must complete and submit one Easy scorecard and one Hard scorecard for this Level."}</p></div><span className={styles.statusChip}>{complete ? "Complete" : locked ? "Locked" : "Open"}</span></div>
            {locked ? <p className={styles.helper}>This Level is visible, but its challenge requirements stay hidden until it unlocks.</p> : <>
              <div className={styles.sideGrid}>
                {(["Easy", "Hard"] as const).map((difficulty) => <ChallengeSide key={difficulty} course={course} difficulty={difficulty} requirements={difficulty === "Easy" ? level.easyRequirements : level.hardRequirements} requirementsPending={level.requirementsStatus === "pending_review"} onSubmit={() => setSubmission({ challengeKey: "level", level: level.level, difficulty })} />)}
              </div>
              {submission?.challengeKey === "level" && submission.level === level.level && <SubmissionForm course={course} level={level.level} challengeKey="level" difficulty={submission.difficulty} pars={pars?.[submission.difficulty] || null} onCancel={() => setSubmission(null)} onSubmitted={(result) => { setMessage(result); setSubmission(null) }} />}
            </>}
            <RewardStrip course={course} level={level.level} rewardKeys={rewardKeys} />
          </section>
        })}
        {ace && <section className={styles.levelCard} aria-label="Ace Challenge">
          <div className={styles.levelHeader}><div><h2>ACE CHALLENGE</h2><p>Unlocks after Level {ace.unlockAfterLevel}</p></div><span className={styles.statusChip}>{aceUnlocked ? "Unlocked" : "Locked"}</span></div>
          {!aceUnlocked ? <p className={styles.helper}>Complete Level 3 to reveal the Ace Challenge requirements. The requirements stay hidden until then.</p> : <>
            <div className={styles.sideGrid}>
              <ChallengeSide course={course} difficulty="Easy" requirements={ace.easyRequirements} requirementsPending={ace.requirementsStatus === "pending_review"} onSubmit={() => setSubmission({ challengeKey: "ace", level: ace.unlockAfterLevel, difficulty: "Easy" })} />
              <ChallengeSide course={course} difficulty="Hard" requirements={ace.hardRequirements} requirementsPending={ace.requirementsStatus === "pending_review"} onSubmit={() => setSubmission({ challengeKey: "ace", level: ace.unlockAfterLevel, difficulty: "Hard" })} />
            </div>
            {submission?.challengeKey === "ace" && <SubmissionForm course={course} level={ace.unlockAfterLevel} challengeKey="ace" difficulty={submission.difficulty} pars={pars?.[submission.difficulty] || null} onCancel={() => setSubmission(null)} onSubmitted={(result) => { setMessage(result); setSubmission(null) }} />}
          </>}
          <Reward label="Ace Challenge badge" rewardKey={ace.rewardKey} earned={rewardKeys.has(ace.rewardKey)} assetPath={ace.rewardAsset} />
        </section>}
        <section className={styles.levelCard} aria-label="Major Course Challenge rewards">
          <div className={styles.levelHeader}><div><h2>Prestige rewards</h2><p>Earned Course Challenge rewards can be selected for display with your avatar.</p></div></div>
          <div className={styles.rewardStrip}>
            <Reward rewardKey={"course-challenge:" + course.slug + ":course-pro"} label="Course Pro" earned={rewardKeys.has("course-challenge:" + course.slug + ":course-pro")} assetPath={course.courseProAsset || null} />
            <Reward rewardKey={"course-challenge:" + course.slug + ":course-master"} label="Course Master" earned={rewardKeys.has("course-challenge:" + course.slug + ":course-master")} assetPath={course.courseMasterAsset || null} />
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

function RewardStrip({ course, level, rewardKeys }: { course: CourseChallengeCourse; level: number; rewardKeys: Set<string> }) {
  const levelData = course.levels.find((item) => item.level === level)
  const levelKey = "course-challenge:" + course.slug + ":level-" + level + ":sticker"
  const badgeKey = "course-challenge:" + course.slug + ":level-" + level + ":badge"
  return <div className={styles.rewardStrip} aria-label={"Level " + level + " rewards"}>
    <Reward rewardKey={levelKey} label={"Level " + level + " sticker"} earned={rewardKeys.has(levelKey)} assetPath={levelData?.stickerAsset || null} />
    {levelData?.badgeKey && <Reward rewardKey={badgeKey} label={"Level " + level + " badge"} earned={rewardKeys.has(badgeKey)} assetPath={levelData.badgeAsset} />}
  </div>
}

function Reward({ label, rewardKey, earned, assetPath }: { label: string; rewardKey: string; earned: boolean; assetPath: string | null }) {
  return <div className={styles.reward} data-earned={earned} data-reward-key={rewardKey}>{assetPath && <Image src={assetPath} alt="" width={56} height={56} sizes="56px" />}{!assetPath && <span className={styles.rewardMark} aria-hidden="true">{earned ? "✦" : "?"}</span>}<span>{label}</span></div>
}

function SubmissionForm({ course, level, challengeKey, difficulty, pars, onCancel, onSubmitted }: { course: CourseChallengeCourse; level: number; challengeKey: "level" | "ace"; difficulty: CourseChallengeDifficulty; pars: number[] | null; onCancel: () => void; onSubmitted: (message: string) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [scores, setScores] = useState<string[]>(Array.from({ length: 18 }, () => ""))
  const [roundDate, setRoundDate] = useState("")
  const [roundTime, setRoundTime] = useState("")
  const [gameMode, setGameMode] = useState<"solo" | "multiplayer">("solo")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  function chooseFile(next: File | null) { setFile(next); setPreview(next ? URL.createObjectURL(next) : null) }
  async function submit() {
    setError("")
    if (!file || !preview) { setError("Upload the proof scorecard photo first."); return }
    if (!pars || pars.length !== 18) { setError("Authoritative pars are unavailable; submission is blocked until the course catalog is available."); return }
    if (!roundDate || !roundTime) { setError("The scorecard round date and time are required."); return }
    const numericScores = scores.map((value) => Number(value))
    if (numericScores.some((value) => !Number.isInteger(value) || value < 1)) { setError("Enter a positive whole-number score for all 18 holes."); return }
    setBusy(true)
    try {
      const userResult = await supabase.auth.getUser()
      if (!userResult.data.user) { await supabase.auth.signInWithOAuth({ provider: "discord", options: { redirectTo: createDiscordAuthCallbackUrl("player") } }); return }
      const extension = file.name.split(".").at(-1)?.replace(/[^a-z0-9]/gi, "") || "jpg"
      const storagePath = userResult.data.user.id + "/" + course.slug + "/" + challengeKey + "-" + level + "-" + difficulty + "-" + crypto.randomUUID() + "." + extension
      const upload = await supabase.storage.from("course-challenge-proof").upload(storagePath, file, { contentType: file.type || "image/jpeg", upsert: false })
      if (upload.error) throw new Error("Proof photo upload failed: " + upload.error.message)
      const response = await fetch("/api/course-challenges/submissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseSlug: course.slug, level, challengeKey, difficulty, proofPhotoPath: storagePath, scores: numericScores, roundDate, roundTime, gameMode }) })
      const payload = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(payload.error || "Course Challenge submission failed.")
      onSubmitted(payload.message || "Submitted for Course Challenge review.")
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Course Challenge submission failed.") } finally { setBusy(false) }
  }
  return <section className={styles.submissionPanel} aria-label={(challengeKey === "ace" ? "Ace Challenge" : "Level " + level) + " " + difficulty + " scorecard submission"}>
    <div><p className={styles.eyebrow}>{challengeKey === "ace" ? "ACE CHALLENGE" : "LEVEL " + level} · {difficulty.toUpperCase()}</p><h3>Upload proof, then enter all 18 scores</h3></div>
    <p className={styles.helper}>Keep the uploaded photo visible while entering scores. The website uses the typed H1–H18 values for calculation and the photo as evidence.</p>
    <div className={styles.formGrid}><label className={styles.field + " " + styles.fieldWide}>Proof scorecard photo<input type="file" accept="image/*" onChange={(event) => chooseFile(event.target.files?.[0] || null)} /></label>{preview && <img className={styles.photoPreview + " " + styles.fieldWide} src={preview} alt="Uploaded scorecard preview" />}<label className={styles.field}>Round date<input type="date" value={roundDate} onChange={(event) => setRoundDate(event.target.value)} /></label><label className={styles.field}>Round time<input type="time" value={roundTime} onChange={(event) => setRoundTime(event.target.value)} /></label><label className={styles.field}>Game Mode<select value={gameMode} onChange={(event) => setGameMode(event.target.value as "solo" | "multiplayer")}><option value="solo">Solo</option><option value="multiplayer">Multiplayer</option></select></label></div>
    <p className={styles.helper}>If you do not see the date and time on your scorecard, tap the three dots in the bottom-right BEFORE taking your picture. Practice Mode does not qualify.</p>
    <div className={styles.scoreGrid} aria-label="H1 through H18 score entry">{scores.map((value, index) => <label className={styles.scoreInput} key={index}><span>H{index + 1}</span><input inputMode="numeric" min={1} max={99} value={value} onChange={(event) => setScores((old) => old.map((current, item) => item === index ? event.target.value.replace(/[^0-9]/g, "") : current))} /><small>Par {pars?.[index] ?? "—"}</small></label>)}</div>
    <p className={styles.helper}>The final total, relative-to-par result, HIOs, bogeys, pars or better, birdies, eagles, and hole-specific checks all use the authoritative pars shown above.</p>
    {error && <p className={styles.notice}>{error}</p>}
    <div className={styles.buttonRow}><button type="button" className={styles.secondaryButton} onClick={onCancel} disabled={busy}>Cancel</button><button type="button" className={styles.submitButton} onClick={() => void submit()} disabled={busy}>{busy ? "Submitting…" : "Submit scorecard"}</button></div>
  </section>
}