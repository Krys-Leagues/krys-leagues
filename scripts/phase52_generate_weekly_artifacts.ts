import fs from "node:fs"
import path from "node:path"

type Difficulty = "EASY" | "HARD"
type Row = [eventId: string, division: string, player: string, courseCode: string, difficulty: Difficulty, score: number, sourceScreenshot: string, sourceRow: number]

const root = process.cwd()
const image = (event: string, file: string) => `phase52-input/weekly_screenshots/${event}/${file}`

// This is the verified subset transcribed from the original images in this checkpoint.
// Rows not yet transcribed remain explicitly listed in weekly_evidence_exceptions.csv.
const rows: Row[] = [
  ["S21W05_GLE_HWH", "AMATEUR", "Dickfor247", "GLE", "EASY", -21, "image(20261019-155200).png", 1],
  ["S21W05_GLE_HWH", "AMATEUR", "SlugJug33", "GLE", "EASY", -20, "image(20261019-155200).png", 2],
  ["S21W05_GLE_HWH", "AMATEUR", "Tee_Wrecks", "GLE", "EASY", -21, "image(20261019-155200).png", 3],
  ["S21W05_GLE_HWH", "AMATEUR", "nakleh", "GLE", "EASY", -20, "image(20261019-155200).png", 4],
  ["S21W05_GLE_HWH", "AMATEUR", "Dickfor247", "HWH", "HARD", -11, "image(20261019-155200).png", 1],
  ["S21W05_GLE_HWH", "AMATEUR", "SlugJug33", "HWH", "HARD", -9, "image(20261019-155200).png", 2],
  ["S21W05_GLE_HWH", "AMATEUR", "Tee_Wrecks", "HWH", "HARD", -8, "image(20261019-155200).png", 3],
  ["S21W05_GLE_HWH", "AMATEUR", "nakleh", "HWH", "HARD", -7, "image(20261019-155200).png", 4],
  ["S21W05_GLE_HWH", "SEMI-PRO", "call_me_snow", "GLE", "EASY", -25, "image(20261019-155411).png", 1],
  ["S21W05_GLE_HWH", "SEMI-PRO", "Catweazel", "GLE", "EASY", -23, "image(20261019-155411).png", 2],
  ["S21W05_GLE_HWH", "SEMI-PRO", "Calassy", "GLE", "EASY", -24, "image(20261019-155411).png", 3],
  ["S21W05_GLE_HWH", "SEMI-PRO", "The Real JB", "GLE", "EASY", -21, "image(20261019-155411).png", 5],
  ["S21W05_GLE_HWH", "SEMI-PRO", "call_me_snow", "HWH", "HARD", -12, "image(20261019-155411).png", 1],
  ["S21W05_GLE_HWH", "SEMI-PRO", "Catweazel", "HWH", "HARD", -14, "image(20261019-155411).png", 2],
  ["S21W05_GLE_HWH", "SEMI-PRO", "Calassy", "HWH", "HARD", -12, "image(20261019-155411).png", 3],
  ["S21W05_GLE_HWH", "SEMI-PRO", "The Real JB", "HWH", "HARD", -12, "image(20261019-155411).png", 5],
  ["S21W05_GLE_HWH", "PRO", "biz", "GLE", "EASY", -24, "image(20261019-155450).png", 1],
  ["S21W05_GLE_HWH", "PRO", "Mau", "GLE", "EASY", -23, "image(20261019-155450).png", 2],
  ["S21W05_GLE_HWH", "PRO", "NERD_GP", "GLE", "EASY", -29, "image(20261019-155450).png", 3],
  ["S21W05_GLE_HWH", "PRO", "Will_Xo", "GLE", "EASY", -25, "image(20261019-155450).png", 4],
  ["S21W05_GLE_HWH", "PRO", "biz", "HWH", "HARD", -14, "image(20261019-155450).png", 1],
  ["S21W05_GLE_HWH", "PRO", "Mau", "HWH", "HARD", -15, "image(20261019-155450).png", 2],
  ["S21W05_GLE_HWH", "PRO", "NERD_GP", "HWH", "HARD", -9, "image(20261019-155450).png", 3],
  ["S21W05_GLE_HWH", "PRO", "Will_Xo", "HWH", "HARD", -13, "image(20261019-155450).png", 4],
  ["S21W05_GLE_HWH", "ELITE", "moba", "GLE", "EASY", -29, "image(20261019-155508).png", 1],
  ["S21W05_GLE_HWH", "ELITE", "upстаниа_c", "GLE", "EASY", -28, "image(20261019-155508).png", 2],
  ["S21W05_GLE_HWH", "ELITE", "5.0jim", "GLE", "EASY", -31, "image(20261019-155508).png", 3],
  ["S21W05_GLE_HWH", "ELITE", "Fugohallarin", "GLE", "EASY", -26, "image(20261019-155508).png", 4],
  ["S21W05_GLE_HWH", "ELITE", "moba", "HWH", "HARD", -18, "image(20261019-155508).png", 1],
  ["S21W05_GLE_HWH", "ELITE", "upстаниа_c", "HWH", "HARD", -18, "image(20261019-155508).png", 2],
  ["S21W05_GLE_HWH", "ELITE", "5.0jim", "HWH", "HARD", -14, "image(20261019-155508).png", 3],
  ["S21W05_GLE_HWH", "ELITE", "Fugohallarin", "HWH", "HARD", -19, "image(20261019-155508).png", 4],
  ["S20W06_BHE_QVH", "AMATEUR", "ZoeDarlin", "BHE", "EASY", -17, "image(20261019-161525).png", 1],
  ["S20W06_BHE_QVH", "AMATEUR", "KnockoutG", "BHE", "EASY", -16, "image(20261019-161525).png", 2],
  ["S20W06_BHE_QVH", "AMATEUR", "SD_Diver", "BHE", "EASY", -17, "image(20261019-161525).png", 3],
  ["S20W06_BHE_QVH", "AMATEUR", "StoneyMan69", "BHE", "EASY", -16, "image(20261019-161525).png", 4],
  ["S20W06_BHE_QVH", "AMATEUR", "NuttyGrandpa", "BHE", "EASY", -14, "image(20261019-161525).png", 5],
  ["S20W06_BHE_QVH", "AMATEUR", "Alabamer_Hammer", "BHE", "EASY", -12, "image(20261019-161525).png", 6],
  ["S20W06_BHE_QVH", "AMATEUR", "##ultramontani##", "BHE", "EASY", -14, "image(20261019-161525).png", 7],
  ["S20W06_BHE_QVH", "AMATEUR", "Necrolitic", "BHE", "EASY", -10, "image(20261019-161525).png", 8],
  ["S20W06_BHE_QVH", "AMATEUR", "indianchief", "BHE", "EASY", -13, "image(20261019-161525).png", 9],
  ["S20W06_BHE_QVH", "AMATEUR", "joshbenesh", "BHE", "EASY", -8, "image(20261019-161525).png", 10],
  ["S20W06_BHE_QVH", "SEMI-PRO", "The Real JB", "BHE", "EASY", -18, "image(20261019-161601).png", 1],
  ["S20W06_BHE_QVH", "SEMI-PRO", "breezy", "BHE", "EASY", -18, "image(20261019-161601).png", 2],
  ["S20W06_BHE_QVH", "SEMI-PRO", "Maxfrom-fr", "BHE", "EASY", -18, "image(20261019-161601).png", 3],
  ["S20W06_BHE_QVH", "SEMI-PRO", "PaulV-PPP ca", "BHE", "EASY", -11, "image(20261019-161601).png", 4],
  ["S20W06_BHE_QVH", "SEMI-PRO", "Firefly", "BHE", "EASY", -18, "image(20261019-161601).png", 5],
  ["S20W06_BHE_QVH", "SEMI-PRO", "steven_T", "BHE", "EASY", -18, "image(20261019-161601).png", 6],
  ["S20W06_BHE_QVH", "PRO", "akaMikeD", "BHE", "EASY", -16, "image(20261019-161616).png", 1],
  ["S20W06_BHE_QVH", "PRO", "DontQuitWhenLosing", "BHE", "EASY", -19, "image(20261019-161616).png", 2],
  ["S20W06_BHE_QVH", "PRO", "Gus", "BHE", "EASY", -20, "image(20261019-161616).png", 3],
  ["S20W06_BHE_QVH", "PRO", "quickfam4", "BHE", "EASY", -17, "image(20261019-161616).png", 4],
  ["S20W06_BHE_QVH", "PRO", "Trikster32", "BHE", "EASY", -17, "image(20261019-161616).png", 5],
  ["S20W06_BHE_QVH", "PRO", "NERD_GP", "BHE", "EASY", -19, "image(20261019-161616).png", 7],
  ["S20W06_BHE_QVH", "PRO", "Larry", "BHE", "EASY", -19, "image(20261019-161616).png", 8],
  ["S20W06_BHE_QVH", "ELITE", "Harry Highpants", "BHE", "EASY", -23, "image(20261019-162207).png", 1],
  ["S20W06_BHE_QVH", "ELITE", "Matt916", "BHE", "EASY", -21, "image(20261019-162207).png", 2],
  ["S20W06_BHE_QVH", "ELITE", "OpusMcGraw", "BHE", "EASY", -21, "image(20261019-162207).png", 3],
  ["S20W06_BHE_QVH", "ELITE", "mini_G", "BHE", "EASY", -24, "image(20261019-162207).png", 4],
  ["S20W06_BHE_QVH", "ELITE", "bigja33", "BHE", "EASY", -21, "image(20261019-162207).png", 5],
  ["S20W06_BHE_QVH", "ELITE", "INDY", "BHE", "EASY", -20, "image(20261019-162207).png", 6],
  ["S20W06_BHE_QVH", "ELITE", "Zanetti", "BHE", "EASY", -21, "image(20261019-162207).png", 7],
  ["S20W06_BHE_QVH", "ELITE", "FelixTortilla", "BHE", "EASY", -23, "image(20261019-162207).png", 8],
  ["S20W07_ALE_BHH", "AMATEUR", "##ultramontani##", "BHH", "HARD", -16, "image(20261019-160240).png", 1],
  ["S20W07_ALE_BHH", "AMATEUR", "Fake4Real", "BHH", "HARD", -16, "image(20261019-160240).png", 2],
  ["S20W07_ALE_BHH", "AMATEUR", "BadWolff", "BHH", "HARD", -16, "image(20261019-160240).png", 3],
  ["S20W07_ALE_BHH", "AMATEUR", "SD_Diver", "BHH", "HARD", -7, "image(20261019-160240).png", 4],
  ["S20W07_ALE_BHH", "AMATEUR", "KCRob", "BHH", "HARD", -6, "image(20261019-160240).png", 5],
  ["S20W07_ALE_BHH", "AMATEUR", "adaman_can", "BHH", "HARD", -5, "image(20261019-160240).png", 6],
  ["S20W07_ALE_BHH", "AMATEUR", "joshbenesh", "BHH", "HARD", -5, "image(20261019-160240).png", 7],
  ["S20W07_ALE_BHH", "AMATEUR", "KnockoutG", "BHH", "HARD", -4, "image(20261019-160240).png", 8],
  ["S20W07_ALE_BHH", "SEMI-PRO", "Browner", "BHH", "HARD", -18, "image(20261019-160722).png", 1],
  ["S20W07_ALE_BHH", "SEMI-PRO", "steven_T", "BHH", "HARD", -18, "image(20261019-160722).png", 2],
  ["S20W07_ALE_BHH", "SEMI-PRO", "Calassy", "BHH", "HARD", -13, "image(20261019-160722).png", 3],
  ["S20W07_ALE_BHH", "SEMI-PRO", "Duckk", "BHH", "HARD", -18, "image(20261019-160722).png", 4],
  ["S20W07_ALE_BHH", "SEMI-PRO", "Firefly", "BHH", "HARD", -16, "image(20261019-160722).png", 5],
  ["S20W07_ALE_BHH", "SEMI-PRO", "The Mortski", "BHH", "HARD", -14, "image(20261019-160722).png", 6],
  ["S20W07_ALE_BHH", "SEMI-PRO", "Neo Impossible", "BHH", "HARD", -16, "image(20261019-160722).png", 7],
  ["S20W07_ALE_BHH", "SEMI-PRO", "Maxfrom-fr", "BHH", "HARD", -12, "image(20261019-160722).png", 8],
  ["S20W07_ALE_BHH", "ELITE", "his.Dudeness", "BHH", "HARD", -23, "image(20261019-161424).png", 1],
  ["S20W07_ALE_BHH", "ELITE", "bigja33", "BHH", "HARD", -20, "image(20261019-161424).png", 2],
  ["S20W07_ALE_BHH", "ELITE", "Buttonfred", "BHH", "HARD", -22, "image(20261019-161424).png", 4],
  ["S20W07_ALE_BHH", "ELITE", "Colbotic", "BHH", "HARD", -19, "image(20261019-161424).png", 5],
  ["S20W07_ALE_BHH", "ELITE", "Dude_Lebowski", "BHH", "HARD", -16, "image(20261019-161424).png", 6],
  ["S20W07_ALE_BHH", "ELITE", "Zanetti", "BHH", "HARD", -19, "image(20261019-161424).png", 7],
  ["S20W07_ALE_BHH", "ELITE", "Goldenbrett", "BHH", "HARD", -20, "image(20261019-161424).png", 8],
]

const canonicalName: Record<string, string> = {
  BHE: "Blokhaven Easy", BHH: "Blokhaven Hard", GLE: "Gloop Lair Easy", GLH: "Gloop Lair Hard",
  HWH: "Hollywood Hard", HWE: "Hollywood Easy", ALE: "Alfheim Easy", QVH: "Quixote Valley Hard",
  MGE: "Mars Gardens Easy", ZZH: "Temple at Zerzura Hard", RCE: "Raptor Cliff's Easy", RCH: "Raptor Cliff's Hard",
  FFE: "Forgotten Fairyland Easy", FFH: "Forgotten Fairyland Hard", AWE: "Around The World Easy", MWH: "Meow Wolf Hard",
}

function csv(value: unknown): string {
  const text = String(value ?? "")
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
  const median = sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2 : null
  const sd = values.length > 1 && mean !== null ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)) : null
  const eliteCount = values.length ? Math.max(1, Math.ceil(values.length * 0.12)) : 0
  const elite = eliteCount ? sorted.slice(0, eliteCount).reduce((sum, value) => sum + value, 0) / eliteCount : null
  return { rounds: values.length, mean, median, sd, elite, courseRating: values.length >= 20 ? elite : null, slope: values.length >= 20 && mean !== null && elite !== null ? mean - elite : null, min: sorted[0] ?? null, max: sorted.at(-1) ?? null, eliteCount }
}

const evidence = rows.map(([eventId, division, player, courseCode, difficulty, score, file, sourceRow]) => ({
  source: "THE_WEEKLY", eventId, seasonWeek: eventId, division, playerExact: player, sourcePlayerId: "", courseCode,
  canonicalCourse: canonicalName[courseCode] ?? "UNRESOLVED", difficulty, score, completedRound: true, sourceScreenshot: image(eventId, file), sourceRow,
  verificationStatus: "VERIFIED", exceptionReason: "", personalHandicapEligible: false,
}))

const evidenceHeader = ["source", "event_id", "season_week", "division", "player_exact", "source_player_id", "course_code", "canonical_course", "difficulty", "score", "completed_round", "source_screenshot", "source_row", "verification_status", "exception_reason", "personal_handicap_eligible"]
const evidenceLines = evidence.map((row) => [
  row.source, row.eventId, row.seasonWeek, row.division, row.playerExact, row.sourcePlayerId,
  row.courseCode, row.canonicalCourse, row.difficulty, row.score, row.completedRound,
  row.sourceScreenshot, row.sourceRow, row.verificationStatus, row.exceptionReason, row.personalHandicapEligible,
].map(csv).join(","))
fs.writeFileSync(path.join(root, "weekly_course_evidence.csv"), [evidenceHeader.join(","), ...evidenceLines].join("\n") + "\n")

const events = [
  ["S21W05_GLE_HWH", "GLE/HWH", "4 source screenshots; only visible, unambiguous rows transcribed in this checkpoint"],
  ["S20W07_ALE_BHH", "ALE/BHH", "replacement Elite screenshot used; prior 99-penalty capture excluded"],
  ["S20W06_BHE_QVH", "BHE/QVH", "visible rows transcribed; remaining rows pending review"],
]
const exceptionRows = [
  ["source", "event_id", "course_codes", "screenshot_or_scope", "reason", "disposition"],
  ["THE_WEEKLY", "S20W07_ALE_BHH", "ALE/BHH", "supplementary_DO_NOT_DOUBLE_COUNT/image(20261019-160759).png", "superseded Elite capture contains incomplete BHH and tournament penalty 99", "EXCLUDED_REPLACED_CAPTURE"],
  ["THE_WEEKLY", "S18W08_FFE_SECOND_CODE_UNVERIFIED", "FFE/?", "all 4 screenshots", "second course code not verified from supplied evidence", "QUARANTINED"],
  ["THE_WEEKLY", "S20W04_RCE_CLH_UNCONFIRMED_WEEK", "RCE/CLH", "all 4 screenshots", "event week identity marked unconfirmed in manifest", "QUARANTINED_PENDING_EVENT_VERIFICATION"],
  ["THE_WEEKLY", "ALL", "GLH", "manifest and package", "no GLH Weekly event supplied", "NO_ROWS_INVENTED"],
  ["THE_WEEKLY", "S20W07_ALE_BHH", "ALE/BHH", "image(20261019-161424).png", "Elite player name is visibly truncated in the source screenshot; score is not admitted until exact name is reviewed", "QUARANTINED_TRUNCATED_NAME"],
  ["THE_WEEKLY", "ALL", "ALL", "remaining manifest screenshots", "not yet transcribed in this local checkpoint", "PENDING_TRANSCRIPTION"],
]
fs.writeFileSync(path.join(root, "weekly_evidence_exceptions.csv"), exceptionRows.map((line) => line.map(csv).join(",")).join("\n") + "\n")

const summaryHeader = ["event_id", "course_codes", "source", "visible_verified_rows", "status"]
const summary = [summaryHeader, ...events.map(([eventId, codes, note]) => [eventId, codes, "THE_WEEKLY", evidence.filter((row) => row.eventId === eventId).length, note])]
fs.writeFileSync(path.join(root, "weekly_event_summary.csv"), summary.map((line) => line.map(csv).join(",")).join("\n") + "\n")

const aggregateKeys = [...new Set(evidence.map((row) => `${row.courseCode}|${row.difficulty}`))].sort()
const kwtLines = fs.readFileSync(path.join(root, "phase52-input", "kwt_week14_06_scores.csv"), "utf8").trim().split(/\r?\n/).slice(1)
const kwtScores: Record<string, number[]> = { "BHE|EASY": [], "BHH|HARD": [] }
for (const line of kwtLines) {
  const cells = line.split(",")
  const easy = Number(cells[6])
  const hard = Number(cells[7])
  if (Number.isFinite(easy)) kwtScores["BHE|EASY"].push(easy)
  if (Number.isFinite(hard)) kwtScores["BHH|HARD"].push(hard)
}
type Aggregate = ReturnType<typeof stats> & { players: number }
const knownKwt: Record<string, Aggregate> = {
  "HWH|HARD": { rounds: 50, players: 50, mean: -3.26, median: -4, sd: 8.78, elite: -16.667, courseRating: -16.667, slope: 13.407, min: -19, max: 16, eliteCount: 6 },
  "BHE|EASY": { ...stats(kwtScores["BHE|EASY"]), players: 50 },
  "BHH|HARD": { ...stats(kwtScores["BHH|HARD"]), players: 50 },
}
const comparisonHeader = ["course_code", "difficulty", "model", "rounds", "distinct_players", "mean", "median", "sd", "elite_benchmark", "course_rating", "slope", "min", "max", "status"]
const comparison: string[][] = [comparisonHeader]
for (const key of aggregateKeys) {
  const [courseCode, difficulty] = key.split("|")
  const weeklyValues = evidence.filter((row) => `${row.courseCode}|${row.difficulty}` === key).map((row) => row.score)
  const weeklyStats = stats(weeklyValues)
  const kwt = knownKwt[key]
  const combinedValues = kwt && kwtScores[key]?.length ? [...kwtScores[key], ...weeklyValues] : weeklyValues
  const combined = stats(combinedValues)
  for (const [model, value, players] of [["KWT_ONLY", kwt, kwt?.players ?? 0], ["WEEKLY_ONLY", weeklyStats, new Set(evidence.filter((row) => `${row.courseCode}|${row.difficulty}` === key).map((row) => row.playerExact)).size], ["KWT_PLUS_WEEKLY", kwt ? combined : weeklyStats, (kwt?.players ?? 0) + new Set(evidence.filter((row) => `${row.courseCode}|${row.difficulty}` === key).map((row) => row.playerExact)).size]] as const) {
    const hasRawKwt = Boolean(kwtScores[key]?.length)
    const unavailableCombined = model === "KWT_PLUS_WEEKLY" && kwt && !hasRawKwt
    const s = unavailableCombined ? null : ((model === "KWT_ONLY" && hasRawKwt ? stats(kwtScores[key]) : value) as ReturnType<typeof stats>)
    const status = unavailableCombined ? "RAW_KWT_EXPORT_REQUIRED_FOR_COMBINED" : s && s.rounds >= 20 ? "PROVISIONAL_SIMULATION" : "INSUFFICIENT_TRANSCRIBED_SAMPLE"
    comparison.push([courseCode, difficulty, model, s ? s.rounds : 0, unavailableCombined ? "" : players, s?.mean ?? "", s?.median ?? "", s?.sd ?? "", s?.elite ?? "", s?.courseRating ?? "", s?.slope ?? "", s?.min ?? "", s?.max ?? "", status].map(String))
  }
}
fs.writeFileSync(path.join(root, "course_rating_comparison.csv"), comparison.map((line) => line.map(csv).join(",")).join("\n") + "\n")

const report = `# Weekly evidence comparison (Phase 52 local checkpoint)

This report is a **local, provisional comparison**. It is not a Production rating publication and it does not feed personal Handicap histories.

## Evidence status

- Archive manifest: 56 entries; all 56 supplied files matched their manifest SHA-256 in the initial verification.
- This checkpoint transcribes ${evidence.length} visible, unambiguous course rows from S21W05, S20W06, and S20W07.
- The remaining screenshot rows are listed as pending transcription in weekly_evidence_exceptions.csv; they are not silently counted.
- The S20W07 replacement Elite capture is used. The superseded 99-penalty capture is excluded.
- GLH has no supplied Weekly event; no GLH score was invented.

## Formula and thresholds

The existing legacy simulation is used unchanged: Course Rating is the average of the lowest 12% of observed scores and Slope is field average minus the elite average. The proposed thresholds are simulation labels only: under 20 = insufficient, 20–49 = provisional, 50+ = potentially ready. No model was selected or activated.

## Interpretation

The Weekly subset is sufficient to show the intended source separation and to compare distributions where at least 20 visible rows were transcribed. It is **not yet a complete Weekly population**, so the comparison must not be used to approve a rating. The KWT-only BHE/BHH numbers come from the supplied machine-readable KWT14W06 file; HWH's KWT aggregate comes from the read-only Production historical KWT projection. GLE has no KWT rows in the audited historical projection.

Raptor Cliff's Hard is not evaluated from this partial checkpoint; the S19W10 RCH screenshots remain pending transcription and no conclusion is drawn about its relative difficulty.
`
fs.writeFileSync(path.join(root, "course_rating_comparison.md"), report)
fs.writeFileSync(path.join(root, "weekly_source_provenance.md"), `# Weekly source provenance\n\n- Source: The Weekly, external tournament population.\n- Original archive: phase52-input/Krys_Handicap_Weekly_Evidence_Package.zip (preserved by extraction).\n- Manifest: phase52-input/weekly_manifest.csv.\n- All 56 manifest file hashes matched during archive verification.\n- Screenshot references in weekly_course_evidence.csv are relative to the extracted package.\n- Weekly records have course-rating/slope eligibility only; personalHandicapEligible is hard-coded false in the local adapter.\n- KWT source files remain separate and are not merged with Weekly player identities.\n- Mighty Cocobot/leaderboard-style evidence is not imported as ordinary rounds.\n- Unreadable, uncertain, incomplete, superseded, and untranscribed rows are quarantined in weekly_evidence_exceptions.csv.\n`)
