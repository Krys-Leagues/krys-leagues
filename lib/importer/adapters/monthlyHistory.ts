import { MONTHLY_PUBLIC_URL } from "../../externalCompetitionSites.ts"

export type MonthlySourceCell = string | null
export type MonthlySourceTable = { heading: string; division?: string | null; columns: string[]; rows: MonthlySourceCell[][] }
export type MonthlyHistoryFact = {
  resultLevel: "overall_division" | "course"
  monthLabel: string
  table: string
  division: string | null
  course: string | null
  playerName: string
  position: number | null
  coursesPlayed: number | null
  totalStrokes: number | null
  score: number | null
  holesInOne: number | null
  points: number | null
  sourceUrl: string
  sourceFingerprint: string
}

const integer = (value: MonthlySourceCell) => {
  if (value == null || value.trim() === "") return null
  const normalized = value.replaceAll(",", "").trim()
  return /^-?\d+$/.test(normalized) ? Number(normalized) : null
}

const semanticFingerprint = (parts: Array<string | number | null>) =>
  parts.map((value) => value == null ? "∅" : String(value).trim()).join("\u001f")

export function parseMonthlyHistoryTables(monthLabel: string, tables: MonthlySourceTable[], sourceUrl = MONTHLY_PUBLIC_URL): MonthlyHistoryFact[] {
  const facts: MonthlyHistoryFact[] = []
  for (const table of tables) {
    if (/^overall\s+leaders\b/i.test(table.heading.trim())) continue
    const columns = table.columns.map((column) => column.trim().toLowerCase())
    const playerIndex = columns.findIndex((column) => column === "player")
    if (playerIndex < 0) continue
    const positionIndex = columns.findIndex((column) => column === "#" || column === "pos")
    const scoreIndex = columns.findIndex((column) => column === "score")
    const coursesPlayedIndex = columns.findIndex((column) => column.replaceAll(" ", "") === "coursesplayed")
    const totalStrokesIndex = columns.findIndex((column) => column.replaceAll(" ", "") === "totalstrokes")
    const holesIndex = columns.findIndex((column) => column === "hn1" || column === "hn1's")
    const pointsIndex = columns.findIndex((column) => column === "points")

    for (const row of table.rows) {
      const playerName = row[playerIndex]?.trim() || ""
      if (!playerName) continue
      const resultLevel = coursesPlayedIndex >= 0 || totalStrokesIndex >= 0 ? "overall_division" as const : "course" as const
      const fact = {
        resultLevel, monthLabel: monthLabel.trim(), table: table.heading.trim(),
        division: table.division?.trim() || (resultLevel === "overall_division" ? table.heading.replace(/\s+leaders.*$/i, "").trim() || null : null),
        course: resultLevel === "course" ? table.heading.trim() || null : null, playerName,
        position: integer(row[positionIndex]), score: integer(row[scoreIndex]),
        coursesPlayed: integer(row[coursesPlayedIndex]), totalStrokes: integer(row[totalStrokesIndex]),
        holesInOne: integer(row[holesIndex]), points: integer(row[pointsIndex]), sourceUrl,
        sourceFingerprint: "",
      }
      fact.sourceFingerprint = semanticFingerprint([fact.resultLevel, fact.monthLabel, fact.division, fact.course, fact.playerName, fact.position, fact.coursesPlayed, fact.totalStrokes, fact.score, fact.holesInOne, fact.points])
      facts.push(fact)
    }
  }
  return facts
}

export const MONTHLY_HISTORY_POLICY = {
  readOnly: true,
  requiresAdminApprovalToApply: true,
  historicalClimbersPoints: 0,
  unresolvedNamesBlockApply: true,
  archivedAndMemorialPlayersAreValidTargets: true,
} as const
