import fs from "node:fs"
import path from "node:path"
import Papa from "papaparse"
import { OFFICIAL_KWT_CSV_NAMESPACE, buildOfficialKwtCsvProvenance } from "../lib/handicap/phase112KwtCsv.ts"

const root = process.cwd()
const input = path.join(root, "docs", "handicap", "phase111")
const output = path.join(root, "docs", "handicap", "phase114")
const zipSha256 = "E599CF6DF746F6C60C9718FBB73486396055567B738ED1A6EEB5808D2E2E46CE"
const csv = value => { const text = value === null || value === undefined ? "" : String(value); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text }
const writeCsv = (file, headers, rows) => fs.writeFileSync(path.join(output, file), `${headers.join(",")}\n${rows.map(row => headers.map(header => csv(row[header])).join(",")).join("\n")}\n`)
const parse = file => Papa.parse(fs.readFileSync(path.join(input, file), "utf8"), { header: true, skipEmptyLines: true }).data
const shaForManifest = file => parse("phase111_source_manifest.csv").find(row => row.file === file)?.sha256 ?? (() => { throw new Error(`Missing source manifest entry for ${file}`) })()

const ownerMappings = new Map([
  ["bigja33", { id: "69c0daa5-70b8-481b-94e5-a9d033bc75fb", screen: "BIGJA", basis: "OWNER_SUPPLIED_KWT_BIGJA_TO_GLOBAL_PLAYER" }],
  ["Andrew_Holmes", { id: "797063d6-62f9-414f-bd92-e18780ed8e52", screen: "WILMA_FINGERDOO", basis: "OWNER_SUPPLIED_KWT_ANDREW_HOLMES_TO_GLOBAL_PLAYER" }],
  ["WendyW(Wyndemere2020)", { id: "7befb54f-6eec-4c7c-9881-c75d1acfb8d8", screen: "Wendyw", basis: "EXISTING_VERIFIED_IDENTITY_LINK_TO_CANONICAL_PLAYER" }],
])
const verifiedNormalizedMappings = new Map([
  ["BadWolff¿", { id: "9976197b-dc3d-4cf6-9200-603a3d1acbf9", screen: "BadWolff�", basis: "UNIQUE_VERIFIED_SCREEN_NAME_AFTER_ENCODING_NORMALIZATION" }],
  ["Chelle¿", { id: "e2af01d7-90d5-4963-9d9f-0493df9fefb2", screen: "Chelle�", basis: "UNIQUE_VERIFIED_SCREEN_NAME_AFTER_ENCODING_NORMALIZATION" }],
  ["Laurent¿¿", { id: "fbd60e4a-9d17-4556-9062-dc005a0c5723", screen: "LAURENT", basis: "UNIQUE_VERIFIED_ALIAS_AFTER_ENCODING_NORMALIZATION" }],
  ["musical_atv ¿", { id: "c4198d7c-dbe7-442f-bc89-908b3b1803d0", screen: "MUSICAL_ATV �", basis: "UNIQUE_VERIFIED_SCREEN_NAME_AFTER_ENCODING_NORMALIZATION" }],
  ["PaulV-PPP ¿¿", { id: "eb95bd85-5cee-437b-b458-abedf5a368d3", screen: "PAULV-PPP ��", basis: "UNIQUE_VERIFIED_SCREEN_NAME_AFTER_ENCODING_NORMALIZATION" }],
  ["peach¿", { id: "d74bba7c-a0a8-4976-b7f7-1b9deb23b8b5", screen: "PEACH", basis: "UNIQUE_VERIFIED_SCREEN_NAME_AFTER_ENCODING_NORMALIZATION" }],
  ["plucky¿", { id: "c7c85811-6bb8-4824-a288-2f3ae0af89c9", screen: "PLUCKY�", basis: "UNIQUE_VERIFIED_SCREEN_NAME_AFTER_ENCODING_NORMALIZATION" }],
  ["Spicy - DawnSophia", { id: "95b55b59-45bc-4eaa-a3fe-8c89ab150488", screen: "Spicy - DawnSophia", basis: "UNIQUE_VERIFIED_ALIAS_EXACT" }],
])
const directMappings = new Map([
  ["Adamann", { id: "f834c441-1e9a-4d72-b7cc-279cc3635b82", screen: "Adamann", basis: "UNIQUE_CASE_INSENSITIVE_SCREEN_NAME" }],
  ["dandnt65", { id: "bed410dd-2b89-4db3-8fe4-8226c21c3f5f", screen: "Dandnt65", basis: "UNIQUE_CASE_INSENSITIVE_SCREEN_NAME" }],
  ["Dickfor24-7", { id: "c0ccc790-8001-4224-807a-04d253c7cf46", screen: "DICKFOR24-7", basis: "UNIQUE_CASE_INSENSITIVE_SCREEN_NAME" }],
  ["Jesunet", { id: "a0eaf23c-0784-4eb9-ab1d-530b077121a9", screen: "JESUNET", basis: "UNIQUE_CASE_INSENSITIVE_SCREEN_NAME" }],
  ["Maxfrom-fr", { id: "6918df0a-cc2b-495a-8c09-b8be600ed0bc", screen: "MAXFROM-FR", basis: "UNIQUE_CASE_INSENSITIVE_SCREEN_NAME" }],
  ["Raccoons Whisker", { id: "4d58c67c-8890-41d7-af98-3d82a8a6879d", screen: "RACCOONS WHISKER", basis: "UNIQUE_CASE_INSENSITIVE_SCREEN_NAME" }],
])
const pairs = parse("kwt_s14w05_12_pair_reconciliation.csv")
const prior = new Map(pairs.filter(row => row.canonical_player_id).map(row => [row.player, { id: row.canonical_player_id, screen: row.player, basis: "PHASE68_EXACT_KWT_EVIDENCE" }]))
const mappings = new Map([...prior, ...directMappings, ...verifiedNormalizedMappings, ...ownerMappings])
const resolved = pairs.filter(row => mappings.has(row.player))
const unresolved = pairs.filter(row => !mappings.has(row.player))
if (resolved.length !== 364 || unresolved.length !== 7) throw new Error(`Unexpected Phase 114 resolution ${resolved.length}/${unresolved.length}`)

const courseMap = new Map()
for (const row of Papa.parse(fs.readFileSync(path.join(root, "docs", "handicap", "phase68", "handicap_source_provenance_import.csv"), "utf8"), { header: true, skipEmptyLines: true }).data) {
  const metadata = JSON.parse(row.metadata || "{}")
  if (row.original_course_code && metadata.course_id) courseMap.set(row.original_course_code, [metadata.course_id, metadata.difficulty])
}
for (const [code, courseId, difficulty] of [["BHE", "Blokhaven_easy", "easy"], ["BHH", "Blokhaven_hard", "hard"], ["GLE", "Gloop Lair_easy", "easy"], ["GLH", "Gloop Lair_hard", "hard"]]) if (!courseMap.has(code)) courseMap.set(code, [courseId, difficulty])

const rows = []
for (const pair of resolved) {
  const base = { season: Number(pair.season), week: Number(pair.week), eventId: pair.eventId, player: pair.player, canonicalPlayerId: mappings.get(pair.player).id, easyCode: pair.easyCode, hardCode: pair.hardCode, easyScore: Number(pair.easyScore), hardScore: Number(pair.hardScore), totalScore: Number(pair.totalScore), detailFile: pair.detailFile, detailFileSha256: shaForManifest(pair.detailFile), detailRow: Number(pair.detailRow), summaryFile: pair.summaryFile, summaryFileSha256: shaForManifest(pair.summaryFile), summaryRow: Number(pair.summaryRow), zipSha256 }
  for (const difficulty of ["easy", "hard"]) {
    const provenance = buildOfficialKwtCsvProvenance(base, difficulty)
    const [courseId] = courseMap.get(provenance.originalCourseCode) ?? []
    if (!courseId) throw new Error(`Missing course mapping for ${provenance.originalCourseCode}`)
    rows.push({ source_fingerprint: provenance.sourceFingerprint, source_type: provenance.sourceType, source_ref: provenance.sourceRef, source_season: provenance.sourceSeason, source_week: provenance.sourceWeek, original_player_name: provenance.originalPlayerName, canonical_player_id: provenance.canonicalPlayerId, original_course_label: courseId, original_course_code: provenance.originalCourseCode, difficulty: provenance.difficulty, score: provenance.score, metadata: JSON.stringify({ ...provenance.metadata, course_id: courseId, identity_resolution_basis: mappings.get(pair.player).basis }), import_status: "IMPORT_CANDIDATE_REQUIRES_NAMESPACE_REVIEW" })
  }
}
const oldFingerprints = new Set(Papa.parse(fs.readFileSync(path.join(root, "docs", "handicap", "phase68", "handicap_source_provenance_import.csv"), "utf8"), { header: true, skipEmptyLines: true }).data.map(row => row.source_fingerprint))
if (new Set(rows.map(row => row.source_fingerprint)).size !== rows.length || rows.some(row => oldFingerprints.has(row.source_fingerprint))) throw new Error("Phase 114 fingerprint collision")
const exceptions = unresolved.map(row => ({ season: row.season, week: row.week, event_id: row.eventId, original_player_name: row.player, detail_file: row.detailFile, detail_row: row.detailRow, summary_file: row.summaryFile, summary_row: row.summaryRow, easy_code: row.easyCode, hard_code: row.hardCode, easy_score: row.easyScore, hard_score: row.hardScore, total_score: row.totalScore, status: "QUARANTINED_UNRESOLVED_CANONICAL_IDENTITY", reason: "No unique verified canonical Global Player evidence found; no identity guess applied." }))
const identityRows = [...new Set(pairs.map(row => row.player))].sort((a, b) => a.localeCompare(b)).map(name => ({ source_name: name, canonical_player_id: mappings.get(name)?.id ?? "", canonical_screen_name: mappings.get(name)?.screen ?? "", resolution: mappings.has(name) ? "RESOLVED" : "QUARANTINED", evidence: mappings.get(name)?.basis ?? "NO_AUTHORITATIVE_MATCH", source_discord_id_used: "NO" }))
const reviewNames = ["BadWolff¿", "Chelle¿", "Honeybee1998", "Laurent¿¿", "PaulV-PPP ¿¿", "Spicy - DawnSophia", "Stephen1D47", "musical_atv ¿", "peach¿", "plucky¿", "¿¿¿¿¿¿"]
const reviewCandidates = new Map([
  ["¿¿¿¿¿¿", { candidate: "JULIAN", candidate_player_id: "57d7ddc3-1cd4-4e17-97cf-30343e26ced0", rank: 1, evidence: "Owner-supplied lead; exact Discord ID is linked to canonical JULIAN and verified JULIAN/JULIAN1830 aliases, but no KWT source evidence links the corrupted value", confidence: "LEAD_NOT_CONFIRMED", action: "QUARANTINE" }],
  ["Stephen1D47", { candidate: "Stephen1d47", candidate_player_id: "", rank: 1, evidence: "Discord member name only; player_id is NULL", confidence: "NON_AUTHORITATIVE", action: "QUARANTINE" }],
])
for (const name of reviewNames) {
  const mapping = mappings.get(name)
  const candidate = mapping
    ? { candidate: mapping.screen, candidate_player_id: mapping.id, rank: 1, evidence: mapping.basis, confidence: "HIGH", action: "AUTO_RESOLVED_LOCALLY" }
    : reviewCandidates.get(name) ?? { candidate: "", candidate_player_id: "", rank: "", evidence: "No authoritative canonical Global Player candidate found", confidence: "NONE", action: "QUARANTINE" }
  const affected = pairs.filter(row => row.player === name)
  reviewCandidates.set(name, { ...candidate, weeks: [...new Set(affected.map(row => `S${row.season}W${String(row.week).padStart(2, "0")}`))].join(";"), pairs: affected.length, observations: affected.length * 2 })
}
const candidateRows = reviewNames.map(name => ({ original_name: name, weeks: reviewCandidates.get(name).weeks, player_week_pairs: reviewCandidates.get(name).pairs, observations: reviewCandidates.get(name).observations, candidate_rank: reviewCandidates.get(name).rank, candidate_screen_name: reviewCandidates.get(name).candidate, candidate_player_id: reviewCandidates.get(name).candidate_player_id, evidence: reviewCandidates.get(name).evidence, confidence: reviewCandidates.get(name).confidence, action: reviewCandidates.get(name).action }))
fs.mkdirSync(output, { recursive: true })
writeCsv("handicap_source_provenance_import.csv", Object.keys(rows[0]), rows)
writeCsv("handicap_source_provenance_exceptions.csv", Object.keys(exceptions[0]), exceptions)
writeCsv("identity_resolution.csv", Object.keys(identityRows[0]), identityRows)
writeCsv("identity_match_candidates.csv", Object.keys(candidateRows[0]), candidateRows)
const manifest = { package_version: "phase114-official-kwt-csv-reconciled-v1", source_zip_sha256: zipSha256, source_namespace: OFFICIAL_KWT_CSV_NAMESPACE, source_type: "KWT", total_player_week_pairs: pairs.length, resolved_player_week_pairs: resolved.length, quarantined_player_week_pairs: unresolved.length, import_candidate_course_observations: rows.length, quarantined_course_observations: unresolved.length * 2, source_ids_recovered: false, numeric_source_player_ids_recovered: false, numeric_round_ids_recovered: false, discord_ids_used_as_kwt_ids: false, weekly_personal_handicap_eligible: false, official_sequence: "SEASON_WEEK_EASY_HARD", status: "LOCAL_CANDIDATE_REQUIRES_SCHEMA_AND_PUBLICATION_GATE_REVIEW", identity_mapping_policy: "OWNER_SUPPLIED_OR_UNIQUE_VERIFIED_NORMALIZED_GLOBAL_PLAYER_EVIDENCE_ONLY", counts: { fingerprints: rows.length, unique_fingerprints: new Set(rows.map(row => row.source_fingerprint)).size, old_phase68_collisions: 0 } }
fs.writeFileSync(path.join(output, "package_manifest.json"), JSON.stringify(manifest, null, 2) + "\n")
fs.writeFileSync(path.join(output, "README.md"), `# Phase 114 reconciled Season 14 KWT CSV candidate\n\nResolved ${resolved.length} of ${pairs.length} official player-week pairs using owner-supplied canonical mappings, existing identity links, unique verified aliases, or unique normalized canonical screen names. ${unresolved.length} pairs remain quarantined. No numeric KWT IDs, round IDs, Discord IDs, or calendar dates were invented.\n\nThis package is local-only and requires separate provenance-contract review before Production import.\n`)
console.log(JSON.stringify({ output, pairs: pairs.length, resolvedPairs: resolved.length, unresolvedPairs: unresolved.length, candidateRows: rows.length, quarantinedRows: unresolved.length * 2 }, null, 2))
