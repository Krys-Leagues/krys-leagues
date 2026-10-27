import Papa from "papaparse"

export type CsvEncoding = "UTF-8" | "WINDOWS-1252"

export type ParsedCsv = {
  rows: Record<string, string>[]
  encoding: CsvEncoding
  errors: string[]
}

export type KwtPairObservation = {
  season: number
  week: number
  eventId: string
  player: string
  easyCode: string
  hardCode: string
  easyScore: number | null
  hardScore: number | null
  totalScore: number | null
  detailFile: string
  summaryFile: string
  detailRow: number
  summaryRow: number | null
  summaryMatch: "EXACT" | "MISSING" | "CONFLICT"
  holeSumStatus: "MATCH" | "MISMATCH" | "NOT_AVAILABLE"
  summaryAvatar: string
  sourceIdStatus: "MISSING_IN_SOURCE_FILE"
  importEligibility: "BLOCKED_MISSING_AUTHORITATIVE_SOURCE_ID_AND_ROUND_ID"
}

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, "").trim()
}

export function decodeCsvBytes(bytes: Uint8Array): { text: string; encoding: CsvEncoding } {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    return { text, encoding: "UTF-8" }
  } catch {
    return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "WINDOWS-1252" }
  }
}

export function parseCsvText(text: string, encoding: CsvEncoding): ParsedCsv {
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })
  const rows = (parsed.data ?? []).map((row) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeHeader(key), String(value ?? "")]),
  ))
  return {
    rows,
    encoding,
    errors: parsed.errors.map((error) => `${error.code}:${error.message}`),
  }
}

export function parseNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null
  const parsed = Number(value.trim())
  return Number.isFinite(parsed) ? parsed : null
}

export function weekFromEvent(value: string): { season: number; week: number; eventId: string } | null {
  const match = /^KWT(\d+)W(\d+)$/i.exec(value.trim())
  if (!match) return null
  return { season: Number(match[1]), week: Number(match[2]), eventId: `KWT${match[1]}W${match[2]}` }
}

function sameNumber(left: number | null, right: number | null): boolean {
  return left === right
}

function summaryMatch(detail: Record<string, string>, summary: Record<string, string>): boolean {
  return detail.Player === summary.Player
    && detail["Easy Code"] === summary["Easy Course"]
    && detail["Hard Code"] === summary["Hard Course"]
    && sameNumber(parseNumber(detail.Easy), parseNumber(summary.Easy))
    && sameNumber(parseNumber(detail.Hard), parseNumber(summary.Hard))
    && sameNumber(parseNumber(detail["Total Score"]), parseNumber(summary.Total))
}

export function reconcileKwtWeek(input: {
  detailFile: string
  summaryFile: string
  detailRows: Record<string, string>[]
  summaryRows: Record<string, string>[]
}): KwtPairObservation[] {
  const firstWeek = input.summaryRows.map((row) => weekFromEvent(row.Week)).find(Boolean)
  if (!firstWeek) return []
  const consumed = new Set<number>()
  return input.detailRows.map((detail, index) => {
    const candidates = input.summaryRows
      .map((summary, summaryIndex) => ({ summary, summaryIndex }))
      .filter(({ summaryIndex }) => !consumed.has(summaryIndex) && input.summaryRows[summaryIndex].Player === detail.Player)
    const exact = candidates.find(({ summary }) => summaryMatch(detail, summary))
    const conflict = candidates[0]
    const selected = exact ?? conflict
    if (selected) consumed.add(selected.summaryIndex)
    const easyHoleScores = Array.from({ length: 18 }, (_, hole) => parseNumber(detail[`E${hole + 1}`]))
    const hardHoleScores = Array.from({ length: 18 }, (_, hole) => parseNumber(detail[`H${hole + 1}`]))
    const holeSum = (values: (number | null)[]) => values.every((value) => value !== null)
      ? values.reduce((sum, value) => sum + (value ?? 0), 0)
      : null
    const easySum = holeSum(easyHoleScores)
    const hardSum = holeSum(hardHoleScores)
    const easy = parseNumber(detail.Easy)
    const hard = parseNumber(detail.Hard)
    const holeSumStatus = easySum === null || hardSum === null
      ? "NOT_AVAILABLE"
      : easySum === easy && hardSum === hard ? "MATCH" : "MISMATCH"
    return {
      season: firstWeek.season,
      week: firstWeek.week,
      eventId: firstWeek.eventId,
      player: detail.Player,
      easyCode: detail["Easy Code"],
      hardCode: detail["Hard Code"],
      easyScore: easy,
      hardScore: hard,
      totalScore: parseNumber(detail["Total Score"]),
      detailFile: input.detailFile,
      summaryFile: input.summaryFile,
      detailRow: index + 2,
      summaryRow: selected ? selected.summaryIndex + 2 : null,
      summaryMatch: exact ? "EXACT" : selected ? "CONFLICT" : "MISSING",
      holeSumStatus,
      summaryAvatar: selected?.summary.Avatar ?? "",
      sourceIdStatus: "MISSING_IN_SOURCE_FILE",
      importEligibility: "BLOCKED_MISSING_AUTHORITATIVE_SOURCE_ID_AND_ROUND_ID",
    }
  })
}

export function localEvidenceKey(row: Pick<KwtPairObservation, "eventId" | "player" | "easyCode" | "hardCode" | "detailRow">): string {
  return ["KWT", row.eventId, row.player, row.easyCode, row.hardCode, row.detailRow].join("|")
}
