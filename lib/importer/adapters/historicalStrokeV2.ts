export const HISTORICAL_STROKE_V2_PARSER_VERSION = "historical-stroke-v2"

export type HistoricalStrokeV2PeriodStatus =
  | "HISTORICAL / COMPLETE"
  | "CURRENT / INCOMPLETE / NOT IMPORTABLE"
  | "UNKNOWN SOURCE STATUS"

export type HistoricalStrokeV2ScoreState =
  | "PLAYED / NUMERIC"
  | "UNPLAYED / BLANK"
  | "UNPLAYED / DASH"
  | "UNPLAYED / SOURCE TOKEN"
  | "MALFORMED SOURCE"
  | "CURRENT / INCOMPLETE / NOT IMPORTABLE"

export type HistoricalStrokeV2PairingState =
  | "SOURCE COLOR CONFIRMED — PLAYED"
  | "SOURCE COLOR CONFIRMED — SCHEDULED / UNPLAYED"
  | "PARTIAL — NEEDS REVIEW"
  | "AMBIGUOUS COLOR GROUP — NEEDS REVIEW"
  | "UNKNOWN — NO SOURCE COLOR EVIDENCE"
  | "ADMIN CONFIRMED"

export type HistoricalStrokeV2Source = {
  workbook: string
  tab: string
  sourceRow: number | null
  sourceCells: string
  sourceRange: string
  sourceUrl: string
  sourceSha256: string
  sourceEra: string
  sourceStatus: HistoricalStrokeV2PeriodStatus
  provenance: string
}

export type HistoricalStrokeV2CourseObservation = {
  season: number
  division: number
  historicalPlayerName: string
  courseOrder: number
  courseName: string
  scoreState: HistoricalStrokeV2ScoreState
  played: boolean
  score: number | null
  rawScoreToken: string
  sourcePlayedState: string
  outcome: "W" | "L" | "D" | null
  publishedPlacement: number | null
  playedCount: number | null
  wins: number | null
  draws: number | null
  losses: number | null
  points: number | null
  strokes: number | null
  sourceScoreCell: string
  sourceScoreRange: string
  sourceFontColor: string | null
  source: HistoricalStrokeV2Source
  rawSourceValues: Record<string, unknown> | string[]
  sourceFingerprint: string
  importable: boolean
}

export type HistoricalStrokeV2Standing = {
  season: number
  division: number
  historicalPlayerName: string
  publishedPlacement: number | null
  playedCount: number | null
  wins: number | null
  draws: number | null
  losses: number | null
  points: number | null
  strokes: number | null
  source: HistoricalStrokeV2Source
  importable: boolean
  courses: HistoricalStrokeV2CourseObservation[]
}

export type HistoricalStrokeV2Period = {
  season: number
  status: HistoricalStrokeV2PeriodStatus
  sourceEra: string
  sourceSha256: string
  importable: boolean
  standings: HistoricalStrokeV2Standing[]
}

export type HistoricalStrokeV2PairingEvidence = {
  season: number
  periodType: string
  division: number | null
  gameNumber: number | null
  courseName: string
  playerA: string
  playerB: string
  sourceRowA: number | null
  sourceRowB: number | null
  sourceCellA: string
  sourceCellB: string
  sourceColor: string | null
  playedState: string
  pairingState: HistoricalStrokeV2PairingState
  evidenceType: string
  source: HistoricalStrokeV2Source
  notes: string
  deduplicationKey: string
}

export type HistoricalStrokeV2MalformedRow = {
  season: number
  division: number | null
  sourceRow: number | null
  historicalPlayerName: string
  rawSourceRow: string[]
  reason: string
  importStatus: string
  source: HistoricalStrokeV2Source
  importable: false
}

export type HistoricalStrokeV2Preview = {
  parserVersion: typeof HISTORICAL_STROKE_V2_PARSER_VERSION
  source: {
    filename: string
    normalizedSourceSha256: string
    sourceSha256s: string[]
  }
  periods: HistoricalStrokeV2Period[]
  observations: HistoricalStrokeV2CourseObservation[]
  pairings: HistoricalStrokeV2PairingEvidence[]
  malformedRows: HistoricalStrokeV2MalformedRow[]
  audit: {
    periods: number
    historicalPeriods: number
    currentPeriods: number
    importableObservations: number
    observations: number
    playedObservations: number
    unplayedObservations: number
    blankUnplayedObservations: number
    dashUnplayedObservations: number
    sourceTokenUnplayedObservations: number
    malformedObservations: number
    currentObservations: number
    negativeScores: number
    positiveScores: number
    numericZeroScores: number
    rawPairingRecords: number
    deduplicatedPairingRecords: number
    playedPairings: number
    confirmedPairings: number
    scheduledPairings: number
    partialPairings: number
    ambiguousPairings: number
    unknownPairings: number
    duplicatePairingRecordsCollapsed: number
  }
  issues: string[]
}

export type HistoricalStrokeV2PackageInput = {
  normalizedCsv: string
  sourceFilename?: string
  normalizedSourceSha256?: string
  manifestJson?: string
  pairingCsv?: string
  malformedCsv?: string
}

type CsvRecord = Record<string, string>

function parseCsv(text: string): CsvRecord[] {
  const rows: string[][] = []
  let current: string[] = []
  let value = ""
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"'
        index += 1
      } else quoted = !quoted
    } else if (character === "," && !quoted) {
      current.push(value)
      value = ""
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1
      current.push(value)
      if (current.some((cell) => cell !== "")) rows.push(current)
      current = []
      value = ""
    } else value += character
  }
  if (value !== "" || current.length > 0) {
    current.push(value)
    if (current.some((cell) => cell !== "")) rows.push(current)
  }
  const headers = rows.shift() ?? []
  return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])))
}

function integer(value: string | undefined): number | null {
  const trimmed = (value ?? "").trim()
  if (!/^-?\d+$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function sourceStatus(value: string | undefined): HistoricalStrokeV2PeriodStatus {
  const normalized = (value ?? "").trim().toUpperCase()
  if (normalized === "HISTORICAL" || normalized.startsWith("HISTORICAL /")) return "HISTORICAL / COMPLETE"
  if (normalized.includes("CURRENT") || normalized.includes("INCOMPLETE") || normalized.includes("NOT IMPORTABLE")) return "CURRENT / INCOMPLETE / NOT IMPORTABLE"
  return "UNKNOWN SOURCE STATUS"
}

function pairingState(value: string | undefined, evidenceType: string | undefined): HistoricalStrokeV2PairingState {
  const text = `${value ?? ""} ${evidenceType ?? ""}`.toUpperCase()
  if (text.includes("ADMIN CONFIRMED")) return "ADMIN CONFIRMED"
  if (text.includes("AMBIGUOUS")) return "AMBIGUOUS COLOR GROUP — NEEDS REVIEW"
  if (text.includes("PARTIAL")) return "PARTIAL — NEEDS REVIEW"
  if (text.includes("SCHEDULED") || text.includes("UNPLAYED")) return "SOURCE COLOR CONFIRMED — SCHEDULED / UNPLAYED"
  if (text.includes("SOURCE COLOR CONFIRMED") || text.includes("PLAYED")) return "SOURCE COLOR CONFIRMED — PLAYED"
  return "UNKNOWN — NO SOURCE COLOR EVIDENCE"
}

function rawValues(value: string | undefined): Record<string, unknown> | string[] {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) || (parsed && typeof parsed === "object") ? parsed as Record<string, unknown> | string[] : { raw: value }
  } catch {
    return { raw: value }
  }
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(",")}}`
  }
  return JSON.stringify(value)
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

function manifestSources(manifestJson: string | undefined) {
  if (!manifestJson) return [] as Array<Record<string, string>>
  try {
    const parsed = JSON.parse(manifestJson) as { sources?: Array<Record<string, string>> }
    return parsed.sources ?? []
  } catch {
    return []
  }
}

function manifestMetadata(manifestJson: string | undefined) {
  if (!manifestJson) return {} as Record<string, unknown>
  try {
    const parsed = JSON.parse(manifestJson) as Record<string, unknown>
    return parsed
  } catch {
    return {}
  }
}

function sourceFromManifest(item: Record<string, string>): HistoricalStrokeV2Source {
  return {
    workbook: item.workbook ?? "",
    tab: item.tab ?? "",
    sourceRow: null,
    sourceCells: "",
    sourceRange: item.range ?? "",
    sourceUrl: item.url ?? "",
    sourceSha256: item.sourceSha256 ?? "",
    sourceEra: item.sourceEra ?? "",
    sourceStatus: sourceStatus(item.status),
    provenance: "preserved source manifest",
  }
}

function sourceFor(row: CsvRecord, manifests: Array<Record<string, string>>): HistoricalStrokeV2Source {
  const rowSha = (row.source_sha256 ?? "").toLowerCase()
  const match = manifests.find((item) => (item.sourceSha256 ?? "").toLowerCase() === rowSha || (item.tab === row.source_tab && item.workbook === row.source_workbook))
  return {
    workbook: row.source_workbook ?? match?.workbook ?? "",
    tab: row.source_tab ?? match?.tab ?? "",
    sourceRow: integer(row.source_row),
    sourceCells: row.source_score_cell ?? "",
    sourceRange: row.source_range ?? match?.range ?? "",
    sourceUrl: row.source_url ?? match?.url ?? "",
    sourceSha256: row.source_sha256 ?? match?.sourceSha256 ?? "",
    sourceEra: row.source_era ?? match?.sourceEra ?? "",
    sourceStatus: sourceStatus(match?.status ?? row.import_status),
    provenance: row.provenance ?? "",
  }
}

function scoreFor(row: CsvRecord, status: HistoricalStrokeV2PeriodStatus) {
  const rawScoreToken = row.raw_score_token ?? row.score ?? ""
  const sourcePlayedState = (row.played_state ?? "").trim().toUpperCase()
  const sourcePlayed = (row.played ?? "").trim().toLowerCase()
  const explicitlyUnplayed = sourcePlayed === "false" || sourcePlayedState.includes("UNPLAYED") || sourcePlayedState.includes("SCHEDULED")
  const explicitlyPlayed = sourcePlayed === "true" || sourcePlayedState.includes("PLAYED")
  if (status !== "HISTORICAL / COMPLETE") return { scoreState: "CURRENT / INCOMPLETE / NOT IMPORTABLE" as const, played: false, score: null, sourcePlayedState: row.played_state ?? "" }
  if (row.import_status?.toUpperCase().includes("MALFORMED") || sourcePlayedState.includes("MALFORMED")) return { scoreState: "MALFORMED SOURCE" as const, played: false, score: null, sourcePlayedState: row.played_state ?? "" }
  if (explicitlyUnplayed) {
    if (rawScoreToken === "") return { scoreState: "UNPLAYED / BLANK" as const, played: false, score: null, sourcePlayedState: row.played_state ?? "" }
    if (/^-+$/.test(rawScoreToken.trim())) return { scoreState: "UNPLAYED / DASH" as const, played: false, score: null, sourcePlayedState: row.played_state ?? "" }
    return { scoreState: "UNPLAYED / SOURCE TOKEN" as const, played: false, score: null, sourcePlayedState: row.played_state ?? "" }
  }
  if (!explicitlyPlayed && rawScoreToken === "") return { scoreState: "UNPLAYED / BLANK" as const, played: false, score: null, sourcePlayedState: row.played_state ?? "" }
  if (!explicitlyPlayed && /^-+$/.test(rawScoreToken.trim())) return { scoreState: "UNPLAYED / DASH" as const, played: false, score: null, sourcePlayedState: row.played_state ?? "" }
  const score = integer(rawScoreToken)
  if (score === null) return { scoreState: "MALFORMED SOURCE" as const, played: false, score: null, sourcePlayedState: row.played_state ?? "" }
  return { scoreState: "PLAYED / NUMERIC" as const, played: true, score, sourcePlayedState: row.played_state ?? "" }
}

function eraFor(season: number) {
  if (season === 1) return "legacy_9_course_aggregate_s1"
  if (season === 2) return "legacy_9_course_aggregate_s2"
  if (season <= 8) return "marker_based_9_course_s3_s8"
  if (season === 9) return "one_sided_9_course_s9"
  if (season <= 18) return "one_sided_5_course_s10_s18"
  if (season <= 42) return "one_sided_3_course_s19_s42"
  if (season <= 61) return "mirrored_3_course_s43_s61"
  return "current_active_layout"
}

export async function parseHistoricalStrokeV2Package(input: HistoricalStrokeV2PackageInput): Promise<HistoricalStrokeV2Preview> {
  const rows = parseCsv(input.normalizedCsv)
  const manifests = manifestSources(input.manifestJson)
  const manifest = manifestMetadata(input.manifestJson)
  const issues: string[] = []
  if (rows.length === 0) issues.push("The normalized Stroke CSV contains no rows.")
  if (manifests.length === 0) issues.push("The source manifest is missing or could not be read; importability is blocked.")

  const observations: HistoricalStrokeV2CourseObservation[] = rows.map((row) => {
    const season = integer(row.season) ?? 0
    const source = sourceFor(row, manifests)
    const status = source.sourceStatus
    const scored = scoreFor(row, status)
    const sourceFingerprint = stable({ season, division: row.division, sourceRow: row.source_row, courseOrder: row.course_order, sourceSha256: source.sourceSha256, sourceCell: source.sourceCells, name: row.historical_player_name })
    const importable = status === "HISTORICAL / COMPLETE" && scored.scoreState !== "MALFORMED SOURCE" && scored.scoreState !== "UNPLAYED / SOURCE TOKEN"
    return {
      season,
      division: integer(row.division) ?? 0,
      historicalPlayerName: row.historical_player_name ?? "",
      courseOrder: integer(row.course_order) ?? 0,
      courseName: row.course_name ?? "",
      ...scored,
      rawScoreToken: row.raw_score_token ?? row.score ?? "",
      sourcePlayedState: row.played_state ?? "",
      outcome: row.outcome === "W" || row.outcome === "L" || row.outcome === "D" ? row.outcome : null,
      publishedPlacement: integer(row.source_position),
      wins: integer(row.wins),
      draws: integer(row.draws),
      losses: integer(row.losses),
      points: integer(row.points),
      strokes: integer(row.total_strokes),
      playedCount: integer(row.played_count) ?? ([integer(row.wins), integer(row.draws), integer(row.losses)].every((value) => value !== null) ? (integer(row.wins) ?? 0) + (integer(row.draws) ?? 0) + (integer(row.losses) ?? 0) : null),
      sourceScoreCell: row.source_score_cell ?? "",
      sourceScoreRange: row.source_score_range ?? "",
      sourceFontColor: row.source_font_color || null,
      source,
      rawSourceValues: rawValues(row.raw_source_row_json),
      sourceFingerprint,
      importable,
    }
  })

  const byStanding = new Map<string, HistoricalStrokeV2Standing>()
  for (const observation of observations) {
    const key = `${observation.season}|${observation.division}|${observation.historicalPlayerName}|${observation.source.sourceRow ?? ""}`
    const current = byStanding.get(key)
    if (current) current.courses.push(observation)
    else byStanding.set(key, {
      season: observation.season,
      division: observation.division,
      historicalPlayerName: observation.historicalPlayerName,
      publishedPlacement: observation.publishedPlacement,
      playedCount: observation.playedCount,
      wins: observation.wins,
      draws: observation.draws,
      losses: observation.losses,
      points: observation.points,
      strokes: observation.strokes,
      source: observation.source,
      importable: observation.importable,
      courses: [observation],
    })
  }
  const standings = Array.from(byStanding.values())
  const manifestSeasons = manifests.map((item) => integer(item.tab)).filter((season): season is number => season !== null)
  const currentExcludedSeason = integer(String(manifest.historicalCoverage && typeof manifest.historicalCoverage === "object" ? (manifest.historicalCoverage as Record<string, unknown>).currentExcludedSeason ?? "" : ""))
  const seasonNumbers = Array.from(new Set([...observations.map((observation) => observation.season), ...manifestSeasons, ...(currentExcludedSeason === null ? [] : [currentExcludedSeason])])).filter((season) => season > 0).sort((a, b) => a - b)
  const periods = seasonNumbers.map((season) => {
    const seasonStandings = standings.filter((standing) => standing.season === season)
    const source = seasonStandings[0]?.source ?? sourceFromManifest(manifests.find((item) => integer(item.tab) === season) ?? (currentExcludedSeason === season ? manifests.find((item) => (item.status ?? "").toUpperCase().includes("CURRENT")) : undefined) ?? {})
    const status = source?.sourceStatus ?? "UNKNOWN SOURCE STATUS"
    return { season, status, sourceEra: source?.sourceEra || eraFor(season), sourceSha256: source?.sourceSha256 ?? "", importable: status === "HISTORICAL / COMPLETE", standings: seasonStandings }
  })

  const malformedRows: HistoricalStrokeV2MalformedRow[] = parseCsv(input.malformedCsv ?? "").map((row) => {
    const season = integer(row.season) ?? 0
    const source = sourceFor(row, manifests)
    return { season, division: integer(row.division), sourceRow: integer(row.source_row), historicalPlayerName: row.historical_player_name ?? "", rawSourceRow: (rawValues(row.raw_source_row_json) as string[]) ?? [], reason: row.reason ?? "MALFORMED SOURCE", importStatus: row.import_status ?? "BLOCKED / NEEDS KRYS REVIEW", source: { ...source, sourceStatus: "HISTORICAL / COMPLETE" }, importable: false as const }
  })

  const rawPairings = parseCsv(input.pairingCsv ?? "")
  const seenPairings = new Map<string, HistoricalStrokeV2PairingEvidence>()
  for (const row of rawPairings) {
    const season = integer(row.season) ?? 0
    const source = sourceFor(row, manifests)
    const cellEndpoints = [row.source_cell_a ?? "", row.source_cell_b ?? ""].sort()
    const deduplicationKey = [season, row.division ?? "", row.game_number ?? row.course_name ?? "", ...cellEndpoints, row.source_color ?? "", source.workbook, source.tab, source.sourceRange, source.sourceSha256].join("|")
    const evidence: HistoricalStrokeV2PairingEvidence = {
      season,
      periodType: row.period_type ?? "season",
      division: integer(row.division),
      gameNumber: integer(row.game_number),
      courseName: row.course_name ?? "",
      playerA: row.player_a ?? "",
      playerB: row.player_b ?? "",
      sourceRowA: integer(row.source_row_a),
      sourceRowB: integer(row.source_row_b),
      sourceCellA: row.source_cell_a ?? "",
      sourceCellB: row.source_cell_b ?? "",
      sourceColor: row.source_color || null,
      playedState: row.played_state ?? "",
      pairingState: pairingState(row.pairing_status, row.evidence_type),
      evidenceType: row.evidence_type ?? "",
      source,
      notes: row.notes ?? "",
      deduplicationKey,
    }
    if (!seenPairings.has(deduplicationKey)) seenPairings.set(deduplicationKey, evidence)
  }
  const pairings = Array.from(seenPairings.values())
  const sourceSha256s = Array.from(new Set(observations.map((observation) => observation.source.sourceSha256).filter(Boolean)))
  return {
    parserVersion: HISTORICAL_STROKE_V2_PARSER_VERSION,
    source: { filename: input.sourceFilename ?? "historical-stroke-normalized.csv", normalizedSourceSha256: input.normalizedSourceSha256 ?? "", sourceSha256s },
    periods,
    observations,
    pairings,
    malformedRows,
    audit: {
      periods: periods.length,
      historicalPeriods: periods.filter((period) => period.status === "HISTORICAL / COMPLETE").length,
      currentPeriods: periods.filter((period) => period.status !== "HISTORICAL / COMPLETE").length,
      importableObservations: observations.filter((observation) => observation.importable).length,
      observations: observations.length,
      playedObservations: observations.filter((observation) => observation.played).length,
      unplayedObservations: observations.filter((observation) => !observation.played && observation.scoreState.includes("UNPLAYED")).length,
      blankUnplayedObservations: observations.filter((observation) => observation.scoreState === "UNPLAYED / BLANK").length,
      dashUnplayedObservations: observations.filter((observation) => observation.scoreState === "UNPLAYED / DASH").length,
      sourceTokenUnplayedObservations: observations.filter((observation) => observation.scoreState === "UNPLAYED / SOURCE TOKEN").length,
      malformedObservations: observations.filter((observation) => observation.scoreState === "MALFORMED SOURCE").length + malformedRows.length,
      currentObservations: observations.filter((observation) => observation.scoreState === "CURRENT / INCOMPLETE / NOT IMPORTABLE").length,
      negativeScores: observations.filter((observation) => observation.played && (observation.score ?? 0) < 0).length,
      positiveScores: observations.filter((observation) => observation.played && (observation.score ?? 0) > 0).length,
      numericZeroScores: observations.filter((observation) => observation.played && observation.score === 0).length,
      rawPairingRecords: rawPairings.length,
      deduplicatedPairingRecords: pairings.length,
      playedPairings: pairings.filter((pairing) => pairing.pairingState === "SOURCE COLOR CONFIRMED — PLAYED").length,
      scheduledPairings: pairings.filter((pairing) => pairing.pairingState === "SOURCE COLOR CONFIRMED — SCHEDULED / UNPLAYED").length,
      confirmedPairings: pairings.filter((pairing) => pairing.pairingState === "SOURCE COLOR CONFIRMED — PLAYED" || pairing.pairingState === "SOURCE COLOR CONFIRMED — SCHEDULED / UNPLAYED").length,
      partialPairings: pairings.filter((pairing) => pairing.pairingState === "PARTIAL — NEEDS REVIEW").length,
      ambiguousPairings: pairings.filter((pairing) => pairing.pairingState === "AMBIGUOUS COLOR GROUP — NEEDS REVIEW").length,
      unknownPairings: pairings.filter((pairing) => pairing.pairingState === "UNKNOWN — NO SOURCE COLOR EVIDENCE").length,
      duplicatePairingRecordsCollapsed: rawPairings.length - pairings.length,
    },
    issues,
  }
}

export async function historicalStrokeV2PreviewFingerprint(preview: HistoricalStrokeV2Preview) {
  return sha256(stable(preview))
}
