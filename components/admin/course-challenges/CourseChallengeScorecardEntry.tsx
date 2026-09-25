"use client"

import { useMemo, useState } from "react"
import { deriveFullCardStats } from "@/lib/all-time/normal-records"
import { nextHoleAfterCompleteInput, parsePositiveHoleScore, sanitizeHoleScoreInput } from "@/lib/all-time/score-input"
import { evaluateCourseChallengeRequirements, validHolePars, validHoleScores } from "@/lib/courseChallenges/evaluation"
import type { CourseChallengeRequirement, CourseChallengeMetrics, RequirementEvaluation } from "@/lib/courseChallenges/types"
import styles from "./CourseChallengeReviewQueue.module.css"

type Props = {
  pars: number[] | null
  existingScores: number[]
  requirements: CourseChallengeRequirement[]
  requirementsStatus: "ready" | "pending_review"
  disabled?: boolean
  onScoresChange: (scores: string[]) => void
}

export type CourseChallengeEntryEvaluation = {
  metrics: CourseChallengeMetrics | null
  requirements: RequirementEvaluation[]
  status: "incomplete" | "auto_pass" | "auto_fail" | "needs_review"
}

export function courseChallengeEntryEvaluation(scores: string[], pars: number[] | null, requirements: CourseChallengeRequirement[], requirementsStatus: "ready" | "pending_review"): CourseChallengeEntryEvaluation {
  const numeric = scores.map(parsePositiveHoleScore)
  if (!validHolePars(pars || []) || !numeric.every((value): value is number => value !== null) || !validHoleScores(numeric)) return { metrics: null, requirements: [], status: "incomplete" }
  const evaluation = evaluateCourseChallengeRequirements(numeric, pars || [], requirements, requirementsStatus)
  return { metrics: evaluation.metrics, requirements: evaluation.requirements, status: evaluation.status }
}

export default function CourseChallengeScorecardEntry({ pars, existingScores, requirements, requirementsStatus, disabled = false, onScoresChange }: Props) {
  const [scores, setScores] = useState<string[]>(() => Array.from({ length: 18 }, (_, index) => existingScores[index] === undefined ? "" : String(existingScores[index])))
  const [focusedHole, setFocusedHole] = useState(() => Math.max(0, existingScores.findIndex((score) => !Number.isInteger(score) || score <= 0)))
  const authoritativePars = validHolePars(pars || []) ? pars || [] : null
  const evaluation = useMemo(() => courseChallengeEntryEvaluation(scores, pars, requirements, requirementsStatus), [pars, requirements, requirementsStatus, scores])
  const fullStats = useMemo(() => {
    if (!authoritativePars) return null
    const numeric = scores.map(parsePositiveHoleScore)
    if (!numeric.every((value): value is number => value !== null)) return null
    const result = deriveFullCardStats(numeric, authoritativePars)
    return "error" in result ? null : result
  }, [authoritativePars, scores])

  function updateHole(index: number, value: string) {
    const sanitized = sanitizeHoleScoreInput(value)
    const next = scores.map((score, scoreIndex) => scoreIndex === index ? sanitized : score)
    setScores(next)
    onScoresChange(next)
    const nextIndex = nextHoleAfterCompleteInput(sanitized, index)
    if (nextIndex !== null) {
      setFocusedHole(nextIndex)
      document.querySelector<HTMLInputElement>(`[data-course-challenge-hole-index="${nextIndex}"]`)?.focus()
    } else if (parsePositiveHoleScore(sanitized) !== null) document.querySelector<HTMLInputElement>("[data-course-challenge-approval]")?.focus()
  }

  return <section className={styles.entryPanel} aria-label="Course Challenge verified scorecard entry">
    <div className={styles.entryHeader}><div><span className={styles.eyebrow}>ADMIN VERIFIED CARD</span><h4>HOLE · PAR · SCORE</h4></div><span className={styles.entryHint}>Enter a score, then continue through Hole 18.</span></div>
    {!authoritativePars ? <p className={styles.blockedNotice} role="alert">Authoritative 18-hole pars are unavailable. Approval is blocked until the exact course/par set resolves.</p> : <>
      <div className={styles.scorecardTable} data-testid="course-challenge-admin-scorecard">
        <div className={styles.scorecardHead}><span>HOLE</span><span>PAR</span><span>SCORE</span></div>
        {Array.from({ length: 18 }, (_, index) => <label key={index} className={focusedHole === index ? styles.scoreRowActive : styles.scoreRow}>
          <span className={styles.holeNumber}>Hole {index + 1}</span>
          <span className={styles.parValue}>{authoritativePars[index]}</span>
          <input data-course-challenge-hole-index={index} className={styles.scoreInput} aria-label={`Score hole ${index + 1}`} inputMode="numeric" pattern="[0-9]*" type="text" value={scores[index]} disabled={disabled} onFocus={(event) => { setFocusedHole(index); event.currentTarget.select() }} onChange={(event) => updateHole(index, event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); updateHole(index, event.currentTarget.value) } }} />
        </label>)}
      </div>
      <p className={styles.keyboardHint}>Click any earlier hole to correct it. Enter advances to the next hole; all values remain editable before approval.</p>
      <div className={styles.liveResult} aria-live="polite"><strong>VERIFIED CARD RESULT</strong><div className={styles.resultGrid}><span>Total strokes <b>{fullStats?.totalStrokes ?? "—"}</b></span><span>Score to par <b>{fullStats ? formatScore(fullStats.scoreRelativeToPar) : "—"}</b></span><span>Aces / HIO <b>{fullStats?.hn1Count ?? "—"}</b></span><span>Card state <b>{evaluation.status === "incomplete" ? `${scores.filter((score) => parsePositiveHoleScore(score) !== null).length}/18 ENTERED` : "18/18 READY"}</b></span></div></div>
      <div className={styles.requirementPreview}><strong>CHALLENGE PREVIEW</strong>{evaluation.status === "incomplete" ? <p>Complete all 18 verified scores to calculate PASS / DOES NOT QUALIFY.</p> : evaluation.requirements.length === 0 ? <p>Challenge requirements are not available for preview; approval remains protected.</p> : <>{evaluation.requirements.map((item) => <div key={item.requirement.id} className={item.status === "passed" ? styles.requirementPassed : item.status === "failed" ? styles.requirementFailed : styles.requirementPending}><span>{item.requirement.label}</span><b>{item.status === "passed" ? "PASS" : item.status === "failed" ? "DOES NOT QUALIFY" : "NEEDS REVIEW"}</b></div>)}<p className={styles.overallResult}>{evaluation.status === "auto_pass" ? "PASS — card meets the loaded challenge requirements." : evaluation.status === "auto_fail" ? "DOES NOT QUALIFY — review the failed requirement before approval." : "NEEDS REVIEW — an admin decision is still required."}</p></>}</div>
    </>}
  </section>
}

function formatScore(value: number) { return value > 0 ? `+${value}` : String(value) }
