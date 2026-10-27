export type RaceDifficulty = "Easy" | "Hard"
export type RaceSource = "overall" | "archived"

export type RaceWorkbookRow = {
  sourceSheet: string
  sourceRow: number
  courseName: string
  difficulty: RaceDifficulty
  playerName: string
  timeText: string
  sourceKey?: string
}

export type RaceBenchmark = {
  sourceSheet: string
  sourceRow: number
  courseName: string
  difficulty: RaceDifficulty
  timeText: string
  timeCentiseconds: number
}

export type RacePlayerResult = RaceWorkbookRow & {
  timeCentiseconds: number
  workbookIdentity: string
  canonicalPlayerId?: string
  canonicalScreenName?: string
  source: RaceSource
  sourceRows: number[]
}

export type RaceCanonicalIdentity = { playerId: string; screenName: string }

export type RaceDeltaKind =
  | "UNCHANGED"
  | "NEW"
  | "IMPROVED"
  | "CHANGED"
  | "NEWLY ARCHIVED"
  | "TIME TO BEAT CHANGED"
  | "NEW COURSE"
  | "NEW PLAYER"
  | "SPELLING/ALIAS CHANGE"
  | "REMOVED/INVALIDATED"
  | "UNRESOLVED PLAYER"
  | "UNRESOLVED COURSE"

const playerAliases: Record<string, string> = {
  PRINCESSBANKSHOT: "PRINCESS BANKSHOT",
  "PRINCESS BANKSHOT": "PRINCESS BANKSHOT",
  ELJORGE: "ELJORGE",
  EL_JORGE: "ELJORGE",
  DERBYDAZ: "DERBY DAZ",
  DERBY_DAZ: "DERBY DAZ",
  "JEREMY CHRISTOPHER": "JEREMY CHRISTOPHER",
  JEREMYCHRISTOPHER: "JEREMY CHRISTOPHER",
  JERMEYCHRISTOPHER: "JEREMY CHRISTOPHER",
  WILL: "WILL",
  WILL_XO: "WILL",
  WILLNCOOKIES: "WILL",
  "SQUEEZY JIBBS": "SQUEEZY_JIBBZ",
}

// Read-only identities resolved from the current public.players table for the
// approved workbook. These UUIDs are references, not player-creation data.
const knownRacePlayerIdentities: Record<string, RaceCanonicalIdentity> = {
  BARU_MONKEY: { playerId: "04a40311-ff05-4087-b64c-d189a19cc52a", screenName: "baru_monkey" },
  CHEESE: { playerId: "9cd0104a-2350-45b2-ad8a-adb66ebb418c", screenName: "c_h_e_e_s_e." },
  DANIELA: { playerId: "32a7cbdb-4446-4d64-b9cd-261a4338dfb5", screenName: "Danielaoculus" },
  DUANE: { playerId: "d6f4a28d-91a4-41d3-b0d2-daab18aed654", screenName: "DUANE" },
  "JEREMY CHRISTOPHER": { playerId: "c5cf15ef-f010-4eca-98a4-90bff5620f7b", screenName: "JEREMYCHRISTOFER" },
  KIERAROBERT: { playerId: "f81f64b6-4990-4d08-86a9-c23c18a24fa3", screenName: "KeiraRobert" },
  MIDASWELL: { playerId: "ff2e8f11-15a8-440e-8b6a-269afe55ee03", screenName: "midaswell" },
  SECRETSKWIRL: { playerId: "3957d77d-c25b-40e5-b715-187d54c93451", screenName: "kim_secret_skwirl" },
  SQUEEZY_JIBBZ: { playerId: "0a4fef7a-880a-4bfe-a663-438b78621178", screenName: "SQUEEZY_JIBBZ" },
  WILL: { playerId: "3bf0f9e6-08a2-4676-a7c6-fb2d3f83d30f", screenName: "WILL" },
}

const courseAliases: Record<string, string> = {
  "20K": "20,000 LEAGUES UNDER THE SEA",
  ALFHIEM: "ALFHEIM",
  ARIZONA: "ARIZONA MODERN",
  "WALLACE & GROMMIT": "WALLACE & GROMIT",
  "WIDOW'S WALK": "WIDOW'S WALKABOUT",
}

export function normalizeWorkbookText(value: string) {
  return value.trim().replace(/[’']/g, "'").replace(/\s+/g, " ").toUpperCase()
}

export function canonicalWorkbookPlayerName(value: string) {
  const normalized = normalizeWorkbookText(value)
  return playerAliases[normalized] ?? normalized
}

export function resolveRaceCanonicalIdentity(value: string) {
  return knownRacePlayerIdentities[canonicalWorkbookPlayerName(value)]
}

export function canonicalWorkbookCourseName(value: string) {
  const normalized = normalizeWorkbookText(value)
  return courseAliases[normalized] ?? normalized
}

export function parseRaceTime(value: string) {
  const match = value.trim().match(/^(\d+):([0-5]\d):(\d{2})$/)
  if (!match) throw new Error(`Invalid Race Mode time: ${value}`)
  return (Number(match[1]) * 60 + Number(match[2])) * 100 + Number(match[3])
}

export function formatRaceTime(timeCentiseconds: number) {
  if (!Number.isInteger(timeCentiseconds) || timeCentiseconds < 0) throw new Error("Race Mode time must be a non-negative integer centisecond value")
  const minutes = Math.floor(timeCentiseconds / 6000)
  const seconds = Math.floor(timeCentiseconds / 100) % 60
  const centiseconds = timeCentiseconds % 100
  return `${minutes}:${String(seconds).padStart(2, "0")}:${String(centiseconds).padStart(2, "0")}`
}

export function isTimeToBeat(value: string) {
  return normalizeWorkbookText(value) === "TIME TO BEAT"
}

export function dedupeRaceRows(rows: RacePlayerResult[]) {
  const deduped = new Map<string, RacePlayerResult>()
  let duplicates = 0
  for (const row of rows) {
    const key = [canonicalWorkbookCourseName(row.courseName), row.difficulty, row.workbookIdentity, row.timeCentiseconds].join("|")
    const existing = deduped.get(key)
    if (!existing) deduped.set(key, { ...row, sourceRows: [row.sourceRow] })
    else {
      duplicates += 1
      existing.sourceRows = [...new Set([...existing.sourceRows, row.sourceRow])].sort((a, b) => a - b)
    }
  }
  return { rows: [...deduped.values()], duplicates }
}

export function rankRaceRows<T extends { time_centiseconds: number }>(rows: T[]) {
  const sorted = [...rows].sort((a, b) => a.time_centiseconds - b.time_centiseconds)
  let previous: number | undefined
  let rank = 0
  return sorted.map((row) => {
    if (previous === undefined || row.time_centiseconds !== previous) rank += 1
    previous = row.time_centiseconds
    return { ...row, rank }
  })
}

export function prepareRaceWorkbook(rows: RaceWorkbookRow[], source: RaceSource) {
  const playerRows: RacePlayerResult[] = []
  const benchmarks: RaceBenchmark[] = []
  for (const row of rows) {
    const timeCentiseconds = parseRaceTime(row.timeText)
    const courseName = canonicalWorkbookCourseName(row.courseName)
    if (isTimeToBeat(row.playerName)) {
      benchmarks.push({ ...row, courseName, timeCentiseconds })
      continue
    }
    playerRows.push({
      ...row,
      courseName,
      timeCentiseconds,
      workbookIdentity: canonicalWorkbookPlayerName(row.playerName),
      canonicalPlayerId: resolveRaceCanonicalIdentity(row.playerName)?.playerId,
      canonicalScreenName: resolveRaceCanonicalIdentity(row.playerName)?.screenName,
      source,
      sourceRows: [row.sourceRow],
    })
  }
  const deduped = dedupeRaceRows(playerRows)
  return { rows: deduped.rows, benchmarks, duplicates: deduped.duplicates }
}

type ComparableRaceRecord = { courseName: string; difficulty: RaceDifficulty; workbookIdentity: string; timeCentiseconds: number; source: RaceSource }

export function compareRaceWorkbooks(oldRows: ComparableRaceRecord[], newRows: ComparableRaceRecord[], oldBenchmarks: RaceBenchmark[] = [], newBenchmarks: RaceBenchmark[] = []) {
  const oldByKey = new Map(oldRows.map(row => [[canonicalWorkbookCourseName(row.courseName), row.difficulty, row.workbookIdentity].join("|"), row]))
  const newByKey = new Map(newRows.map(row => [[canonicalWorkbookCourseName(row.courseName), row.difficulty, row.workbookIdentity].join("|"), row]))
  const deltas: Array<{ kind: RaceDeltaKind; key: string }> = []
  for (const [key, next] of newByKey) {
    const previous = oldByKey.get(key)
    if (!previous) deltas.push({ kind: "NEW", key })
    else if (previous.source !== next.source && next.source === "archived") deltas.push({ kind: "NEWLY ARCHIVED", key })
    else if (previous.timeCentiseconds > next.timeCentiseconds) deltas.push({ kind: "IMPROVED", key })
    else if (previous.timeCentiseconds !== next.timeCentiseconds) deltas.push({ kind: "CHANGED", key })
    else if (previous.workbookIdentity !== next.workbookIdentity) deltas.push({ kind: "SPELLING/ALIAS CHANGE", key })
    else deltas.push({ kind: "UNCHANGED", key })
  }
  for (const key of oldByKey.keys()) if (!newByKey.has(key)) deltas.push({ kind: "REMOVED/INVALIDATED", key })
  const oldBench = new Map(oldBenchmarks.map(row => [[canonicalWorkbookCourseName(row.courseName), row.difficulty].join("|"), row.timeCentiseconds]))
  for (const row of newBenchmarks) {
    const key = [canonicalWorkbookCourseName(row.courseName), row.difficulty].join("|")
    if (oldBench.get(key) !== row.timeCentiseconds) deltas.push({ kind: "TIME TO BEAT CHANGED", key })
  }
  return deltas
}
