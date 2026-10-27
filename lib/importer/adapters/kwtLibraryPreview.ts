import { normalizeIdentity } from "../../identity/normalizeIdentity.ts"
import { previewCompetitionRows, type CompetitionDirectoryPlayer, type CompetitionPreviewRow } from "./competitionPreview.ts"

export type KwtSourceFile = { filename: string; sourceHash: string; rows: Record<string, string>[] }
export type KwtPeriodStatus = "READY" | "NEEDS SOURCE CHOICE" | "MISSING SCORE FACT" | "IDENTITY REVIEW" | "NO SOURCE"

export type KwtVariant = {
  filename: string
  sourceHash: string
  semanticFingerprint: string
  rows: CompetitionPreviewRow[]
  rowCount: number
  easyScoreCount: number
  hardScoreCount: number
  divisionCount: number
  publishedPositionCount: number
  duplicatePlayers: string[]
  identicalCopies: Array<{ filename: string; sourceHash: string }>
  recommended: boolean
}

export type KwtVariantConflict = {
  player: string
  observations: Array<{
    filename: string
    historicalName: string
    easyCourse: string | null
    easyScore: number | null
    hardCourse: string | null
    hardScore: number | null
    division: string | null
    publishedPosition: string | null
    totalScore: number | null
    points: string | null
  }>
}

export type KwtPeriod = {
  season: number
  week: number
  variants: KwtVariant[]
  subsetNotes: string[]
  conflicts: KwtVariantConflict[]
  sourceVariantConflict: boolean
  identitiesResolved: boolean
  missingScoreFacts: number
  status: KwtPeriodStatus
  savedHandicapRoundsPresent: boolean
}

export type KwtLibraryPreview = {
  periods: KwtPeriod[]
  coverage: KwtPeriod[]
  summary: { ready: number; sourceChoice: number; scoreProblems: number; identityBlocked: number; easyReady: number; hardReady: number }
}

const savedHandicapPeriods = new Set([
  "4-1","4-2","4-3","4-4","4-5","4-6","4-8","4-10","4-11",
  "5-1","5-3","5-5","5-9","5-10","5-12",
  "6-1","6-4","6-5","6-8","6-10","6-11",
  "7-3","7-4","7-7","7-9","7-11",
  "8-4","8-7","8-8","8-11",
  "9-1","9-4","9-9","9-10","9-11",
  "10-1","10-2","10-4","10-7","10-9","10-11","10-12",
  "11-1","11-5",
  "12-3","12-5","12-7","12-8","12-12",
])

function periodFromFilename(filename: string) {
  const match = filename.match(/kwt\s*[-_ ]?\s*(\d+)\s*[-_ ]?\s*w(?:eek)?\s*[-_ ]?\s*(\d+)/i)
  return match ? { season: Number(match[1]), week: Number(match[2]) } : null
}

function points(row: CompetitionPreviewRow) {
  const entry = Object.entries(row.raw).find(([key]) => key.trim().toLowerCase() === "points")
  return entry?.[1]?.trim() || null
}

function observation(row: CompetitionPreviewRow) {
  const easy = row.rounds.find(round => round.difficulty === "easy")
  const hard = row.rounds.find(round => round.difficulty === "hard")
  // Downloaded Rank Code / Pos can reflect the download-time player state,
  // not the historical week. They remain raw provenance but are deliberately
  // excluded from authoritative score identity and conflict detection.
  return [normalizeIdentity(row.historicalPlayerName), easy?.courseCode, easy?.score, hard?.courseCode, hard?.score]
    .map(value => String(value ?? "∅")).join("\u001f")
}

function observationMap(rows: CompetitionPreviewRow[]) {
  return new Map(rows.map(row => [normalizeIdentity(row.historicalPlayerName), observation(row)]))
}

function semanticFingerprint(rows: CompetitionPreviewRow[]) {
  return [...rows].map(observation).sort().join("\u001e")
}

function toConflictObservation(filename: string, row: CompetitionPreviewRow) {
  const easy = row.rounds.find(round => round.difficulty === "easy")
  const hard = row.rounds.find(round => round.difficulty === "hard")
  return { filename, historicalName: row.historicalPlayerName, easyCourse: easy?.courseCode ?? null, easyScore: easy?.score ?? null, hardCourse: hard?.courseCode ?? null, hardScore: hard?.score ?? null, division: row.division, publishedPosition: row.publishedPosition, totalScore: row.totalScore, points: points(row) }
}

export function previewKwtLibrary(files: KwtSourceFile[], players: CompetitionDirectoryPlayer[] = []): KwtLibraryPreview {
  const grouped = new Map<string, KwtSourceFile[]>()
  for (const file of files) {
    const period = periodFromFilename(file.filename)
    if (!period) continue
    const key = `${period.season}-${period.week}`
    grouped.set(key, [...(grouped.get(key) ?? []), file])
  }

  const periods = [...grouped.entries()].map(([key, periodFiles]) => {
    const [season, week] = key.split("-").map(Number)
    const rawVariants = periodFiles.map(file => {
      const preview = previewCompetitionRows(file.rows, { kind: "kwt", filename: file.filename, players })
      return { file, rows: preview.rows, semanticFingerprint: semanticFingerprint(preview.rows) }
    })
    const canonical = new Map<string, typeof rawVariants[number]>()
    const copies = new Map<string, Array<{ filename: string; sourceHash: string }>>()
    for (const variant of rawVariants) {
      const existing = canonical.get(variant.semanticFingerprint)
      if (existing) copies.set(existing.file.filename, [...(copies.get(existing.file.filename) ?? []), { filename: variant.file.filename, sourceHash: variant.file.sourceHash }])
      else canonical.set(variant.semanticFingerprint, variant)
    }
    const unique = [...canonical.values()]
    const maps = new Map(unique.map(variant => [variant.file.filename, observationMap(variant.rows)]))
    const conflictsByPlayer = new Map<string, KwtVariantConflict>()
    for (const variant of unique) for (const row of variant.rows) {
      const playerKey = normalizeIdentity(row.historicalPlayerName)
      const seen = unique.flatMap(other => other.rows.filter(candidate => normalizeIdentity(candidate.historicalPlayerName) === playerKey).map(candidate => toConflictObservation(other.file.filename, candidate)))
      const facts = new Set(seen.map(item => [item.easyCourse,item.easyScore,item.hardCourse,item.hardScore].join("\u001f")))
      if (facts.size > 1) conflictsByPlayer.set(playerKey, { player: row.historicalPlayerName, observations: seen.filter((item, index) => seen.findIndex(candidate => candidate.filename === item.filename) === index) })
    }
    const subsetNotes: string[] = []
    for (const smaller of unique) for (const larger of unique) {
      if (smaller === larger || smaller.rows.length >= larger.rows.length) continue
      const smallMap = maps.get(smaller.file.filename)!
      const largeMap = maps.get(larger.file.filename)!
      if ([...smallMap].every(([player, fact]) => largeMap.get(player) === fact)) subsetNotes.push(`${larger.file.filename} contains all observations in ${smaller.file.filename} plus ${larger.rows.length - smaller.rows.length} additional players.`)
    }
    const maxRows = Math.max(...unique.map(variant => variant.rows.length))
    const recommendedFilename = unique.filter(variant => variant.rows.length === maxRows).length === 1 && subsetNotes.some(note => note.startsWith(unique.find(variant => variant.rows.length === maxRows)!.file.filename)) ? unique.find(variant => variant.rows.length === maxRows)!.file.filename : null
    const variants: KwtVariant[] = unique.map(variant => ({
      filename: variant.file.filename, sourceHash: variant.file.sourceHash, semanticFingerprint: variant.semanticFingerprint,
      rows: variant.rows, rowCount: variant.rows.length,
      easyScoreCount: variant.rows.filter(row => row.rounds.find(round => round.difficulty === "easy")?.score !== null).length,
      hardScoreCount: variant.rows.filter(row => row.rounds.find(round => round.difficulty === "hard")?.score !== null).length,
      divisionCount: variant.rows.filter(row => row.division !== null).length,
      publishedPositionCount: variant.rows.filter(row => row.publishedPosition !== null).length,
      duplicatePlayers: [...new Set(variant.rows.filter(row => row.duplicateInFile || row.conflictingObservationInFile).map(row => row.historicalPlayerName))],
      identicalCopies: copies.get(variant.file.filename) ?? [], recommended: variant.file.filename === recommendedFilename,
    }))
    const chosen = variants.find(variant => variant.recommended) ?? (variants.length === 1 ? variants[0] : null)
    const sourceVariantConflict = variants.length > 1
    const allRows = variants.flatMap(variant => variant.rows)
    const identitiesResolved = allRows.every(row => row.identityStatus === "resolved")
    const missingScoreFacts = (chosen?.rows ?? allRows).filter(row => row.rounds.some(round => round.score === null)).length
    const status: KwtPeriodStatus = !identitiesResolved ? "IDENTITY REVIEW" : sourceVariantConflict ? "NEEDS SOURCE CHOICE" : missingScoreFacts ? "MISSING SCORE FACT" : "READY"
    return { season, week, variants, subsetNotes, conflicts: [...conflictsByPlayer.values()], sourceVariantConflict, identitiesResolved, missingScoreFacts, status, savedHandicapRoundsPresent: savedHandicapPeriods.has(key) }
  }).sort((a, b) => a.season - b.season || a.week - b.week)

  const byKey = new Map(periods.map(period => [`${period.season}-${period.week}`, period]))
  const coverage: KwtPeriod[] = []
  for (let season = 4; season <= 14; season++) for (let week = 1; week <= 12; week++) coverage.push(byKey.get(`${season}-${week}`) ?? { season, week, variants: [], subsetNotes: [], conflicts: [], sourceVariantConflict: false, identitiesResolved: false, missingScoreFacts: 0, status: "NO SOURCE", savedHandicapRoundsPresent: savedHandicapPeriods.has(`${season}-${week}`) })
  const selected = periods.map(period => period.variants.find(variant => variant.recommended) ?? (period.variants.length === 1 ? period.variants[0] : null)).filter((variant): variant is KwtVariant => variant !== null)
  return { periods, coverage, summary: {
    ready: periods.filter(period => period.status === "READY").length,
    sourceChoice: periods.filter(period => period.sourceVariantConflict).length,
    scoreProblems: periods.filter(period => period.missingScoreFacts > 0).length,
    identityBlocked: periods.filter(period => !period.identitiesResolved).length,
    easyReady: selected.reduce((sum, variant) => sum + variant.easyScoreCount, 0),
    hardReady: selected.reduce((sum, variant) => sum + variant.hardScoreCount, 0),
  } }
}

export type KwtReconciliationOutcome = "EXACT MATCH" | "NEW MISSING PERIOD" | "SOURCE ENRICHMENT" | "CONFLICT"
export function reconcileKwtObservation(existing: string | null, incoming: string, existingProvenanceStrength = 0, incomingProvenanceStrength = 1): KwtReconciliationOutcome {
  if (existing === null) return "NEW MISSING PERIOD"
  if (existing === incoming) return incomingProvenanceStrength > existingProvenanceStrength ? "SOURCE ENRICHMENT" : "EXACT MATCH"
  return "CONFLICT"
}
