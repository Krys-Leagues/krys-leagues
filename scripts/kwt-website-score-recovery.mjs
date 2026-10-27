import { createHash } from "node:crypto"
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const inputDir = path.resolve(process.argv[2] || "kwt-website-score-recovery-raw")
const outputDir = path.resolve(process.argv[3] || "docs/historical-sources/kwt/website-score-recovery")
const playersPath = process.argv[4] ? path.resolve(process.argv[4]) : null
const integer = (value) => /^-?\d+$/.test(String(value ?? "").trim()) ? Number(value) : null
const identityKey = (value) => String(value ?? "").trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")
const csv = (value) => { const text = value === null || value === undefined ? "" : String(value); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text }
const sha256 = (content) => createHash("sha256").update(content).digest("hex")
const garbled = (value) => /\uFFFD|[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(String(value ?? ""))
const files = (await readdir(inputDir)).filter((name) => /^KWT\d+W\d+\.json$/i.test(name)).sort()
if (files.length === 0) throw new Error(`No KWT source snapshots found in ${inputDir}`)

const rawDir = path.join(outputDir, "raw")
const normalizedDir = path.join(outputDir, "normalized")
await mkdir(rawDir, { recursive: true })
await mkdir(normalizedDir, { recursive: true })
const snapshots = []
for (const file of files) {
  const snapshot = JSON.parse(await readFile(path.join(inputDir, file), "utf8"))
  const rawName = file.replace(/\.json$/i, ".html")
  const rawContent = await readFile(path.join(inputDir, rawName))
  await copyFile(path.join(inputDir, rawName), path.join(rawDir, rawName))
  snapshots.push({ snapshot, rawName, rawContent })
}

const headers = ["season", "week", "player", "historicalRank", "easyCode", "easyScore", "hardCode", "hardScore", "total", "placement", "divisionPlacement", "points", "sourcePlayerId", "easyRoundId", "hardRoundId", "discordId"]
const rows = []
const sourceManifest = []
const sourceHashes = new Map()
const logicalObservations = new Map()
const duplicateRows = []
const conflicts = []
const malformedRows = []
const garbledRows = []
let easyObservations = 0
let hardObservations = 0
let totalObservations = 0
let incorrectTotals = 0

for (const { snapshot, rawName, rawContent } of snapshots) {
  const meta = snapshot.meta
  const sourceHash = sha256(rawContent)
  const sourceGroup = sourceHashes.get(sourceHash) || []
  sourceGroup.push(meta.id)
  sourceHashes.set(sourceHash, sourceGroup)
  sourceManifest.push({ sourceId: meta.id, season: meta.seasonNumber, week: meta.weekNumber, sourceUrl: snapshot.sourceUrl, rawPath: `raw/${rawName}`, rawBytes: rawContent.byteLength, sha256: sourceHash, rowCount: snapshot.rows.length, sourceKind: "authoritative KWT result-table HTML" })
  const normalized = []
  for (let index = 0; index < snapshot.rows.length; index += 1) {
    const source = snapshot.rows[index]
    const rowNumber = index + 1
    const easy = integer(source.easyScore)
    const hard = integer(source.hardScore)
    const suppliedTotal = integer(source.totalScore)
    const computedTotal = easy !== null && hard !== null ? easy + hard : null
    if (easy !== null) easyObservations += 1
    if (hard !== null) hardObservations += 1
    if (suppliedTotal !== null) totalObservations += 1
    const incorrectTotal = suppliedTotal !== null && computedTotal !== null && suppliedTotal !== computedTotal
    if (incorrectTotal) incorrectTotals += 1
    if (garbled(source.name)) garbledRows.push({ sourceId: meta.id, row: rowNumber, name: source.name })
    const missing = ["name", "easyCourseCode", "hardCourseCode"].filter((field) => !String(source[field] ?? "").trim())
    if (easy === null) missing.push("easyScore")
    if (hard === null) missing.push("hardScore")
    if (missing.length || incorrectTotal) malformedRows.push({ sourceId: meta.id, row: rowNumber, missing, incorrectTotal })
    const output = { season: meta.seasonNumber, week: meta.weekNumber, player: source.name, historicalRank: source.historicalRank, easyCode: source.easyCourseCode, easyScore: source.easyScore, hardCode: source.hardCourseCode, hardScore: source.hardScore, total: source.totalScore, placement: source.placement, divisionPlacement: source.divisionPlacement, points: source.points, sourcePlayerId: source.sourcePlayerId, easyRoundId: source.easyRoundId, hardRoundId: source.hardRoundId, discordId: source.discordId }
    normalized.push(output)
    rows.push({ sourceId: meta.id, row: rowNumber, ...output })
    const logicalKey = [meta.seasonNumber, meta.weekNumber, identityKey(source.name), source.easyCourseCode, source.hardCourseCode].join("|")
    const fingerprint = JSON.stringify([source.easyScore, source.hardScore, source.totalScore, source.placement, source.points, source.sourcePlayerId, source.easyRoundId, source.hardRoundId])
    const observations = logicalObservations.get(logicalKey) || []
    if (observations.some((item) => item.fingerprint === fingerprint)) duplicateRows.push({ sourceId: meta.id, row: rowNumber, name: source.name })
    if (observations.length && observations.every((item) => item.fingerprint !== fingerprint)) conflicts.push({ sourceId: meta.id, row: rowNumber, name: source.name, logicalKey })
    observations.push({ sourceId: meta.id, row: rowNumber, fingerprint })
    logicalObservations.set(logicalKey, observations)
  }
  const text = [headers.join(","), ...normalized.map((row) => headers.map((header) => csv(row[header])).join(","))].join("\n") + "\n"
  await writeFile(path.join(normalizedDir, `${meta.id}.csv`), text, "utf8")
}

const players = playersPath ? JSON.parse(await readFile(playersPath, "utf8")) : []
const names = [...new Set(rows.map((row) => row.player).filter((name) => String(name).trim()))].sort((a, b) => a.localeCompare(b))
const candidates = names.map((name) => {
  const key = identityKey(name)
  const matches = players.filter((player) => [player.screenName, ...(player.verifiedAliases || [])].some((alias) => identityKey(alias) === key))
  const unique = [...new Map(matches.map((player) => [player.id, player])).values()]
  return { historicalName: name, candidates: unique.map(({ id, screenName }) => ({ id, screenName })), status: unique.length === 1 ? "exact" : unique.length > 1 ? "ambiguous" : "missing" }
})
const duplicateSourceGroups = [...sourceHashes.values()].filter((ids) => ids.length > 1)
const seasons = [...new Set(rows.map((row) => row.season))].sort((a, b) => a - b)
const weeks = [...new Set(rows.map((row) => `${row.season}-W${String(row.week).padStart(2, "0")}`))].sort((left, right) => {
  const [leftSeason, leftWeek] = left.split("-W").map(Number)
  const [rightSeason, rightWeek] = right.split("-W").map(Number)
  return leftSeason - rightSeason || leftWeek - rightWeek
})
const report = { source: "https://dqvo64m7q9ujvqa-wmgt23ai.adb.us-ashburn-1.oraclecloudapps.com/ords/r/wmgt/kwt/view-results", sourceMethod: "read-only P60_WEEK filter; KR Thursday Night Racing excluded", seasons: seasons.length, weeks: weeks.length, playerWeekRows: rows.length, easyScoreObservations: easyObservations, hardScoreObservations: hardObservations, totalScoreObservations: totalObservations, uniqueHistoricalNames: names.length, exactAutomaticIdentityCandidates: candidates.filter((item) => item.status === "exact").length, missingIdentities: candidates.filter((item) => item.status === "missing").length, ambiguousIdentities: candidates.filter((item) => item.status === "ambiguous").length, duplicateSources: duplicateSourceGroups.flat().length, duplicateRows: duplicateRows.length, conflictingScoreObservations: conflicts.length, blockedMalformedRows: malformedRows.length, garbledNames: garbledRows.length, missingEasyScores: rows.filter((row) => integer(row.easyScore) === null).length, missingHardScores: rows.filter((row) => integer(row.hardScore) === null).length, incorrectTotals, partialSourceVariants: 0, earliestSeasonWeek: weeks[0] ?? null, latestSeasonWeek: weeks.at(-1) ?? null, note: "Historical rank is the rank band printed in each event result row; current directory rank was not used. Discord IDs were retained only when directly supplied by a row (none were supplied)." }
await writeFile(path.join(outputDir, "raw-response-manifest.json"), JSON.stringify({ sources: sourceManifest, duplicateSourceGroups }, null, 2) + "\n")
await writeFile(path.join(outputDir, "identity-candidates.json"), JSON.stringify({ generatedFromScoreRowsOnly: true, candidates }, null, 2) + "\n")
await writeFile(path.join(outputDir, "recovery-report.json"), JSON.stringify({ ...report, malformedRows, garbledRows, duplicateRowDetails: duplicateRows, conflictDetails: conflicts }, null, 2) + "\n")
await writeFile(path.join(outputDir, "source-catalog.json"), JSON.stringify(snapshots.map(({ snapshot }) => snapshot.meta), null, 2) + "\n")
console.log(JSON.stringify(report, null, 2))
