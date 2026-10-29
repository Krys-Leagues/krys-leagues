import { normalizeIdentity } from "../../identity/normalizeIdentity.ts"

export type CompetitionImportKind = "kwt" | "tournament" | "invitational" | "monthly"
export type IdentityResolutionStatus = "resolved" | "ambiguous" | "unresolved"

export type CompetitionDirectoryPlayer = {
  id: string
  screenName: string
  verifiedAliases: string[]
  identityAliases?: Array<{ name: string; source: string | null }>
  status?: string | null
  active?: boolean
  memorial?: boolean
}

export type CompetitionPreviewRow = {
  sourceRow: number
  kind: CompetitionImportKind
  eventName: string | null
  eventType: string | null
  season: string | null
  eventDate: string | null
  historicalPlayerName: string
  canonicalPlayerId: string | null
  canonicalPlayerName: string | null
  canonicalPlayerStatus: string | null
  canonicalPlayerMemorial: boolean
  identityStatus: IdentityResolutionStatus
  identityCandidates: Array<{ id: string; screenName: string }>
  placement: string | null
  publishedPosition: string | null
  division: string | null
  week: number | null
  rounds: Array<{
    courseCode: string | null
    difficulty: "easy" | "hard" | null
    score: number | null
  }>
  totalScore: number | null
  duplicateKey: string
  duplicateInFile: boolean
  conflictingObservationInFile: boolean
  sourceFingerprint: string
  issues: string[]
  warnings: string[]
  raw: Record<string, string>
}

export type CompetitionPreview = {
  rows: CompetitionPreviewRow[]
  summary: {
    totalRows: number
    resolvedPlayers: number
    unresolvedPlayers: number
    ambiguousPlayers: number
    duplicates: number
    safeToApply: number
    blocked: number
    archivedPlayersResolved: number
    memorialPlayersResolved: number
    missingSourceFacts: number
    easyScores: number
    hardScores: number
    missingEasyScores: number
    missingHardScores: number
    divisionsFound: number
    divisionsMissing: number
    placementsFound: number
    placementsMissing: number
    safeWithOptionalFieldsMissing: number
    conflicts: number
  }
}

type PreviewOptions = {
  kind: CompetitionImportKind
  filename?: string
  players?: CompetitionDirectoryPlayer[]
}

const aliases = {
  player: ["player", "player name", "screen name", "name"],
  eventName: ["event name", "tournament", "tournament name", "event", "invitational"],
  eventType: ["event type", "tournament type", "type"],
  season: ["season", "year"],
  date: ["date", "event date", "played date"],
  placement: ["placement", "place", "result", "finish"],
  position: ["pos", "position", "rank"],
  division: ["division", "rank code", "bracket", "field"],
  week: ["week", "round week"],
  total: ["total score", "total strokes", "total", "score"],
  course: ["course", "course name"],
  easyCode: ["easy code", "easycode"],
  easyScore: ["easy score", "easy"],
  hardCode: ["hard code", "hardcode"],
  hardScore: ["hard score", "hard"],
} as const

function normalizedHeaders(row: Record<string, string>) {
  return new Map(Object.entries(row).map(([key, value]) => [key.trim().toLowerCase(), String(value ?? "").trim()]))
}

function read(row: Map<string, string>, names: readonly string[]) {
  for (const name of names) {
    const value = row.get(name)
    if (value) return value
  }
  return null
}

function integer(value: string | null) {
  if (value === null || !/^-?\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function filenameSeasonWeek(filename: string | undefined) {
  const match = filename?.match(/kwt\s*[-_ ]?\s*(\d+)\s*[-_ ]?\s*w(?:eek)?\s*[-_ ]?\s*(\d+)/i)
  return { season: match?.[1] ?? null, week: match ? Number(match[2]) : null }
}

function resolvePlayer(name: string, players: CompetitionDirectoryPlayer[]) {
  const normalized = normalizeIdentity(name)
  const matches = players.filter((player) =>
    [player.screenName, ...player.verifiedAliases].some((candidate) => normalizeIdentity(candidate) === normalized),
  )
  const canonical = new Map(matches.map((player) => [player.id, player]))
  const resolvedPlayers = [...canonical.values()]
  const candidates = resolvedPlayers.map(({ id, screenName }) => ({ id, screenName }))
  if (candidates.length === 1) {
    const player = resolvedPlayers[0]
    return { status: "resolved" as const, playerId: player.id, playerName: player.screenName, playerStatus: player.status ?? null, memorial: player.memorial === true || player.status === "memorial", candidates }
  }
  return {
    status: candidates.length > 1 ? "ambiguous" as const : "unresolved" as const,
    playerId: null,
    playerName: null,
    playerStatus: null,
    memorial: false,
    candidates,
  }
}

type PreviewRowBase = Omit<CompetitionPreviewRow, "duplicateKey" | "duplicateInFile" | "conflictingObservationInFile" | "sourceFingerprint">

function duplicateKey(row: PreviewRowBase) {
  const parts = row.kind === "kwt"
    ? [row.kind, row.season, row.week, row.canonicalPlayerId ?? row.historicalPlayerName]
    : [row.kind, row.eventName, row.eventDate, row.season, row.historicalPlayerName, row.placement, row.division]
  return parts.map((part) => normalizeIdentity(String(part ?? ""))).join("|")
}

function sourceFingerprint(row: PreviewRowBase) {
  return [row.kind, row.season, row.week, row.canonicalPlayerId, row.historicalPlayerName, row.division, row.publishedPosition, row.placement, ...row.rounds.flatMap(round => [round.difficulty, round.courseCode, round.score]), row.totalScore]
    .map(part => normalizeIdentity(String(part ?? "∅"))).join("\u001f")
}

export function previewCompetitionRows(
  sourceRows: Record<string, string>[],
  options: PreviewOptions,
): CompetitionPreview {
  const fromFilename = filenameSeasonWeek(options.filename)
  const rows = sourceRows.map((raw, index) => {
    const values = normalizedHeaders(raw)
    const historicalPlayerName = read(values, aliases.player) ?? ""
    const season = read(values, aliases.season) ?? (options.kind === "kwt" ? fromFilename.season : null)
    const week = integer(read(values, aliases.week)) ?? (options.kind === "kwt" ? fromFilename.week : null)
    const eventName = read(values, aliases.eventName)
    const eventType = read(values, aliases.eventType)
    const identity = resolvePlayer(historicalPlayerName, options.players ?? [])
    const issues: string[] = []
    const warnings: string[] = []
    if (!historicalPlayerName) issues.push("Player name is missing.")
    if (identity.status === "unresolved") issues.push("Player is unresolved.")
    if (identity.status === "ambiguous") issues.push("Player matches more than one canonical identity.")
    if (options.kind === "kwt" && !season) issues.push("KWT season is missing.")
    if (options.kind === "kwt" && week === null) issues.push("KWT week is missing.")
    if (options.kind !== "kwt" && !eventName) issues.push("Event name is missing.")
    const easyScore = integer(read(values, aliases.easyScore))
    const hardScore = integer(read(values, aliases.hardScore))
    if (options.kind === "kwt") {
      if (easyScore === null && hardScore === null) issues.push("Both authoritative KWT scores are missing.")
      else {
        if (easyScore === null) warnings.push("Easy score is missing; preserve it as null.")
        if (hardScore === null) warnings.push("Hard score is missing; preserve it as null.")
      }
      if (!read(values, aliases.division)) warnings.push("Division is not supplied; do not infer it.")
      if (!read(values, aliases.placement) && !read(values, aliases.position)) warnings.push("Position or placement is not supplied; do not infer it.")
    }

    const base: PreviewRowBase = {
      sourceRow: index + 2,
      kind: options.kind,
      eventName,
      eventType,
      season,
      eventDate: read(values, aliases.date),
      historicalPlayerName,
      canonicalPlayerId: identity.playerId,
      canonicalPlayerName: identity.playerName,
      canonicalPlayerStatus: identity.playerStatus,
      canonicalPlayerMemorial: identity.memorial,
      identityStatus: identity.status,
      identityCandidates: identity.candidates,
      placement: read(values, aliases.placement),
      publishedPosition: read(values, aliases.position),
      division: read(values, aliases.division),
      week,
      rounds: options.kind === "kwt" ? [
        { courseCode: read(values, aliases.easyCode)?.toUpperCase() ?? null, difficulty: "easy", score: easyScore },
        { courseCode: read(values, aliases.hardCode)?.toUpperCase() ?? null, difficulty: "hard", score: hardScore },
      ] : options.kind === "monthly" && read(values, aliases.course) ? [{ courseCode: read(values, aliases.course), difficulty: null, score: integer(read(values, ["score"])) }] : [],
      totalScore: integer(read(values, aliases.total)),
      issues,
      warnings,
      raw,
    }
    return { ...base, duplicateKey: duplicateKey(base), sourceFingerprint: sourceFingerprint(base), duplicateInFile: false, conflictingObservationInFile: false }
  })

  const observations = new Map<string, Set<string>>()
  for (const row of rows) {
    const fingerprints = observations.get(row.duplicateKey) ?? new Set<string>()
    fingerprints.add(row.sourceFingerprint)
    observations.set(row.duplicateKey, fingerprints)
  }
  for (const row of rows) {
    const sameKeyRows = rows.filter(candidate => candidate.duplicateKey === row.duplicateKey)
    row.duplicateInFile = sameKeyRows.some(candidate => candidate !== row && candidate.sourceFingerprint === row.sourceFingerprint)
    row.conflictingObservationInFile = (observations.get(row.duplicateKey)?.size ?? 0) > 1
    if (row.duplicateInFile) row.issues.push("Exact duplicate observation in this source; idempotent re-import must skip it.")
    if (row.conflictingObservationInFile) row.issues.push("Conflicting observation for the same player, season, and week requires review.")
  }
  const blocked = rows.filter((row) => row.issues.length > 0).length
  return {
    rows,
    summary: {
      totalRows: rows.length,
      resolvedPlayers: rows.filter((row) => row.identityStatus === "resolved").length,
      unresolvedPlayers: rows.filter((row) => row.identityStatus === "unresolved").length,
      ambiguousPlayers: rows.filter((row) => row.identityStatus === "ambiguous").length,
      duplicates: rows.filter((row) => row.duplicateInFile).length,
      safeToApply: rows.length - blocked,
      blocked,
      archivedPlayersResolved: rows.filter((row) => row.identityStatus === "resolved" && row.canonicalPlayerStatus === "archived" && !row.canonicalPlayerMemorial).length,
      memorialPlayersResolved: rows.filter((row) => row.identityStatus === "resolved" && row.canonicalPlayerMemorial).length,
      missingSourceFacts: rows.filter((row) => [...row.issues, ...row.warnings].some((message) => message.toLowerCase().includes("missing") || message.toLowerCase().includes("not supplied"))).length,
      easyScores: rows.filter(row => row.kind === "kwt" && row.rounds.find(round => round.difficulty === "easy")?.score !== null).length,
      hardScores: rows.filter(row => row.kind === "kwt" && row.rounds.find(round => round.difficulty === "hard")?.score !== null).length,
      missingEasyScores: rows.filter(row => row.kind === "kwt" && row.rounds.find(round => round.difficulty === "easy")?.score === null).length,
      missingHardScores: rows.filter(row => row.kind === "kwt" && row.rounds.find(round => round.difficulty === "hard")?.score === null).length,
      divisionsFound: rows.filter(row => row.kind === "kwt" && row.division !== null).length,
      divisionsMissing: rows.filter(row => row.kind === "kwt" && row.division === null).length,
      placementsFound: rows.filter(row => row.kind === "kwt" && (row.placement !== null || row.publishedPosition !== null)).length,
      placementsMissing: rows.filter(row => row.kind === "kwt" && row.placement === null && row.publishedPosition === null).length,
      safeWithOptionalFieldsMissing: rows.filter(row => row.issues.length === 0 && row.warnings.length > 0).length,
      conflicts: rows.filter(row => row.conflictingObservationInFile).length,
    },
  }
}
