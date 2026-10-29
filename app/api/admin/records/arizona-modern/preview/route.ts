import { parseArizonaCourseCsv } from "@/lib/all-time/arizona/csv"
import { buildPreviewRows } from "@/lib/all-time/arizona/scoring"
import type { BestRecordSnapshot, IdentityPreview } from "@/lib/all-time/arizona/types"
import { authorizedAdminClient, loadIdentityDirectory, loadIndividualCourses, loadSelectedCourse } from "../_shared"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const authorization = await authorizedAdminClient(request)
  if (authorization.error) return authorization.error
  try { return Response.json({ courses: await loadIndividualCourses(authorization.supabase!) }) }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Course catalog failed." }, { status: 400 }) }
}

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
    const target = course.code
    const parsed = parseArizonaCourseCsv(await file.text(), course, file.name)
    const directory = await loadIdentityDirectory(authorization.supabase!)
    const matches = directory.matchNames([...new Set(parsed.records.map((row) => row.historicalPlayerName))])
    const identities = new Map<string, IdentityPreview>(matches.map((match) => {
      const resolved = match.autoLinkEligible && Boolean(match.playerId)
      return [match.importedName, { historicalPlayerName: match.importedName, status: resolved ? "resolved" : match.playerId ? "ambiguous" : "unresolved", playerId: resolved ? match.playerId : null, canonicalScreenName: resolved ? match.matchedName : null, matchedSource: match.evidence, confidence: match.confidence, candidates: match.playerId ? [{ playerId: match.playerId!, screenName: match.matchedName ?? "Candidate", matchedValue: match.importedName, confidence: match.confidence }] : [] }]
    }))
    const { data: bestData, error: bestError } = await authorization.supabase!.from("all_time_best_records").select("player_id, score, course:all_time_courses!inner(code)")
    if (bestError) throw new Error(`Could not load current All-Time best records: ${bestError.message}`)
    const existingBest: BestRecordSnapshot[] = (bestData ?? []).flatMap((row) => { const course = Array.isArray(row.course) ? row.course[0] : row.course; return course?.code === target ? [{ courseCode: target, playerId: directory.canonicalId(row.player_id), score: row.score }] : [] })
    return Response.json({ courseCode: target, csvFilename: parsed.csvFilename, csvFileHash: parsed.csvFileHash, sourceRowsScanned: parsed.records.length + parsed.issues.length, issues: parsed.issues, existingBest, previewRows: buildPreviewRows(parsed.records, identities, existingBest) })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "CSV preview failed." }, { status: 400 })
  }
}
