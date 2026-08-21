import { parseArizonaCourseCsv } from "@/lib/all-time/arizona/csv"
import type { ArizonaIdentityDecision } from "@/lib/all-time/arizona/types"
import { buildVerifiedAliasMemoryRequests, rememberVerifiedPlayerAliases } from "@/lib/importer/rememberVerifiedPlayerAliases"
import { authorizedAdminClient, loadIdentityDirectory, loadSelectedCourse } from "../_shared"

export const runtime = "nodejs"
type Decisions = Record<string, ArizonaIdentityDecision>

export async function POST(request: Request) {
  const authorization = await authorizedAdminClient(request)
  if (authorization.error) return authorization.error
  try {
    const form = await request.formData()
    const courseCode = form.get("courseCode")
    const file = form.get("csv")
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv")) return Response.json({ error: "Upload one CSV file." }, { status: 400 })
    if (file.size > 2_000_000) return Response.json({ error: "CSV must be 2 MB or smaller." }, { status: 400 })
    const course = await loadSelectedCourse(authorization.supabase!, courseCode)
    const parsed = parseArizonaCourseCsv(await file.text(), course, file.name)
    if (parsed.issues.length) return Response.json({ error: "Resolve or remove every invalid/duplicate CSV row before import.", issues: parsed.issues }, { status: 400 })
    const decisions = JSON.parse(String(form.get("decisions") ?? "{}")) as Decisions
    const directory = await loadIdentityDirectory(authorization.supabase!)
    const matches = new Map(directory.matchNames([...new Set(parsed.records.map((row) => row.historicalPlayerName))]).map((match) => [match.importedName, match]))
    const playerIds = new Set(directory.rawPlayers.map((player) => directory.canonicalId(player.id)))
    const memoryDecisions: Array<{ historicalDisplayName: string; playerId: string | null; playerScreenName: string | null; explicitlyApproved: boolean }> = []
    const observations = parsed.records.map((row) => {
      const match = matches.get(row.historicalPlayerName)
      let decision = decisions[row.fingerprint]
      if (!decision && match?.autoLinkEligible && match.playerId) decision = { playerId: match.playerId, canonicalScreenName: match.matchedName, selectionSource: "auto" }
      if (!decision) throw new Error(`Review identity for ${row.historicalPlayerName} before import.`)
      const playerId = decision.playerId ? directory.canonicalId(decision.playerId) : null
      if (decision.selectionSource !== "unresolved" && (!playerId || !playerIds.has(playerId))) throw new Error(`Selected Global Player for ${row.historicalPlayerName} is invalid.`)
      if (decision.selectionSource === "auto" && (!match?.autoLinkEligible || directory.canonicalId(match.playerId!) !== playerId)) throw new Error(`Automatic identity evidence changed for ${row.historicalPlayerName}; preview again.`)
      if (decision.selectionSource === "manual" && playerId) memoryDecisions.push({ historicalDisplayName: row.historicalPlayerName, playerId, playerScreenName: decision.canonicalScreenName, explicitlyApproved: true })
      return { course_code: row.courseCode, source_course_name: row.sourceCourseName, historical_player_name: row.historicalPlayerName, score: row.score, source_row: row.sourceRow, source_name_cell: row.sourceNameCell, source_score_cell: row.sourceScoreCell, source_rank: row.sourceRank, fingerprint: row.fingerprint, identity_status: playerId ? "resolved" : "unresolved", player_id: playerId, metadata: { ingestion_format: "csv", csv_filename: file.name, csv_row: row.csvRow, source_workbook: row.sourceFilename, source_date: row.sourceDate, notes: row.notes } }
    })
    const { data, error } = await authorization.supabase!.rpc("apply_all_time_record_import", { p_batch: { source_type: "historical_workbook", original_filename: file.name, source_worksheet: "All Time", file_sha256: parsed.csvFileHash, metadata: { ingestion_format: "csv", target_course: course.code, source_workbooks: [...new Set(parsed.records.map((row) => row.sourceFilename))] } }, p_observations: observations })
    if (error) throw new Error(error.message)
    const memory = await rememberVerifiedPlayerAliases(buildVerifiedAliasMemoryRequests(memoryDecisions), async (args) => authorization.supabase!.rpc("remember_verified_player_alias", args))
    return Response.json({ result: data, identityMemory: memory })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "CSV import failed." }, { status: 400 })
  }
}
