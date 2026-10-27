import fs from "node:fs"
import path from "node:path"
import Papa from "papaparse"
import { OFFICIAL_KWT_CSV_NAMESPACE, buildOfficialKwtCsvProvenance, sha256Hex } from "../lib/handicap/phase112KwtCsv.ts"

const root = process.cwd()
const input = path.join(root, "docs", "handicap", "phase111")
const output = path.join(root, "docs", "handicap", "phase112")
const zipSha256 = "E599CF6DF746F6C60C9718FBB73486396055567B738ED1A6EEB5808D2E2E46CE"

function csv(value) {
  const text = value === null || value === undefined ? "" : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}
function writeCsv(file, headers, rows) {
  fs.writeFileSync(path.join(output, file), `${headers.join(",")}\n${rows.map(row => headers.map(header => csv(row[header])).join(",")).join("\n")}\n`)
}
function parse(file) {
  return Papa.parse(fs.readFileSync(path.join(input, file), "utf8"), { header: true, skipEmptyLines: true }).data
}
function shaForManifest(file) {
  const manifest = parse("phase111_source_manifest.csv").find(row => row.file === file)
  if (!manifest) throw new Error(`Missing source manifest entry for ${file}`)
  return manifest.sha256
}
function idMap() {
  const rows = parse("kwt_s14w05_12_pair_reconciliation.csv")
  const existing = new Map(rows.filter(row => row.canonical_player_id).map(row => [row.player, row.canonical_player_id]))
  const currentExact = new Map([
    ["Adamann", "f834c441-1e9a-4d72-b7cc-279cc3635b82"],
    ["Andrew_Holmes", "941dfbd4-a394-417f-a942-d47ce09cee77"],
    ["bigja33", "e6d2e396-7aac-4f20-bf7b-f5a31c0d2c3b"],
    ["dandnt65", "bed410dd-2b89-4db3-8fe4-8226c21c3f5f"],
    ["Dickfor24-7", "c0ccc790-8001-4224-807a-04d253c7cf46"],
    ["Jesunet", "a0eaf23c-0784-4eb9-ab1d-530b077121a9"],
    ["Maxfrom-fr", "6918df0a-cc2b-495a-8c09-b8be600ed0bc"],
    ["Raccoons Whisker", "4d58c67c-8890-41d7-af98-3d82a8a6879d"],
    ["WendyW(Wyndemere2020)", "bc717fcf-dc63-4a52-9096-279b007d8a91"],
  ])
  const names = new Map([...existing, ...currentExact])
  return { existing, currentExact, names }
}

const all = parse("kwt_s14w05_12_pair_reconciliation.csv")
const identities = idMap()
const resolved = all.filter(row => identities.names.has(row.player))
const unresolved = all.filter(row => !identities.names.has(row.player))
if (resolved.length !== 324 || unresolved.length !== 47) throw new Error(`Unexpected identity resolution ${resolved.length}/${unresolved.length}`)

const courseMap = new Map()
for (const row of parse(path.join("..", "phase68", "handicap_source_provenance_import.csv"))) {
  const metadata = JSON.parse(row.metadata || "{}")
  if (row.original_course_code && metadata.course_id) courseMap.set(row.original_course_code, [metadata.course_id, metadata.difficulty])
}
for (const [code, courseId, difficulty] of [
  ["BHE", "Blokhaven_easy", "easy"], ["BHH", "Blokhaven_hard", "hard"],
  ["GLE", "Gloop Lair_easy", "easy"], ["GLH", "Gloop Lair_hard", "hard"],
]) if (!courseMap.has(code)) courseMap.set(code, [courseId, difficulty])
const rows = []
for (const pair of resolved) {
  const detailSha = shaForManifest(pair.detailFile)
  const summarySha = shaForManifest(pair.summaryFile)
  const base = {
    season: Number(pair.season), week: Number(pair.week), eventId: pair.eventId, player: pair.player,
    canonicalPlayerId: identities.names.get(pair.player), easyCode: pair.easyCode, hardCode: pair.hardCode,
    easyScore: Number(pair.easyScore), hardScore: Number(pair.hardScore), totalScore: Number(pair.totalScore),
    detailFile: pair.detailFile, detailFileSha256: detailSha, detailRow: Number(pair.detailRow),
    summaryFile: pair.summaryFile, summaryFileSha256: summarySha, summaryRow: Number(pair.summaryRow), zipSha256,
  }
  for (const difficulty of ["easy", "hard"]) {
    const provenance = buildOfficialKwtCsvProvenance(base, difficulty)
    const [courseId] = courseMap.get(provenance.originalCourseCode) ?? []
    if (!courseId) throw new Error(`Missing explicit course mapping for ${provenance.originalCourseCode}`)
    rows.push({
      source_fingerprint: provenance.sourceFingerprint,
      source_type: provenance.sourceType,
      source_ref: provenance.sourceRef,
      source_season: provenance.sourceSeason,
      source_week: provenance.sourceWeek,
      original_player_name: provenance.originalPlayerName,
      canonical_player_id: provenance.canonicalPlayerId,
      original_course_label: courseId,
      original_course_code: provenance.originalCourseCode,
      difficulty: provenance.difficulty,
      score: provenance.score,
      metadata: JSON.stringify({ ...provenance.metadata, course_id: courseId }),
      import_status: "IMPORT_CANDIDATE_REQUIRES_NAMESPACE_REVIEW",
    })
  }
}
const fingerprintSet = new Set(rows.map(row => row.source_fingerprint))
const oldFingerprints = new Set(parse(path.join("..", "phase68", "handicap_source_provenance_import.csv")).map(row => row.source_fingerprint))
const collisions = rows.filter(row => oldFingerprints.has(row.source_fingerprint))
if (fingerprintSet.size !== rows.length || collisions.length) throw new Error(`Fingerprint collision: local=${fingerprintSet.size}/${rows.length} old=${collisions.length}`)

const exceptions = unresolved.map(row => ({
  season: row.season, week: row.week, event_id: row.eventId, original_player_name: row.player,
  detail_file: row.detailFile, detail_row: row.detailRow, summary_file: row.summaryFile, summary_row: row.summaryRow,
  easy_code: row.easyCode, hard_code: row.hardCode, easy_score: row.easyScore, hard_score: row.hardScore,
  total_score: row.totalScore, status: "QUARANTINED_UNRESOLVED_CANONICAL_IDENTITY",
  reason: "No exact canonical screen-name evidence; source Discord links were not used as KWT numeric IDs or as identity merges.",
}))
const identityRows = [...new Set(all.map(row => row.player))].sort((a, b) => a.localeCompare(b)).map(name => {
  const id = identities.names.get(name)
  const via = identities.existing.has(name) ? "PHASE68_EXACT_KWT_EVIDENCE" : id ? "PRODUCTION_PLAYERS_CASE_INSENSITIVE_EXACT" : "UNRESOLVED"
  return { source_name: name, canonical_player_id: id ?? "", resolution: id ? "RESOLVED" : "QUARANTINED", evidence: via, source_discord_id_used: "NO" }
})
fs.mkdirSync(output, { recursive: true })
writeCsv("handicap_source_provenance_import.csv", Object.keys(rows[0]), rows)
writeCsv("handicap_source_provenance_exceptions.csv", Object.keys(exceptions[0]), exceptions)
writeCsv("identity_resolution.csv", Object.keys(identityRows[0]), identityRows)
const manifest = {
  package_version: "phase112-official-kwt-csv-v1",
  source_zip_sha256: zipSha256,
  source_manifest: "../phase111/phase111_source_manifest.csv",
  source_namespace: OFFICIAL_KWT_CSV_NAMESPACE,
  source_type: "KWT",
  total_player_week_pairs: all.length,
  resolved_player_week_pairs: resolved.length,
  quarantined_player_week_pairs: unresolved.length,
  import_candidate_course_observations: rows.length,
  quarantined_course_observations: unresolved.length * 2,
  source_ids_recovered: false,
  numeric_source_player_ids_recovered: false,
  numeric_round_ids_recovered: false,
  canonical_identity_policy: "EXACT_OR_EXACT_NORMALIZED_CANONICAL_SCREEN_NAME_ONLY",
  discord_ids_used_as_kwt_ids: false,
  weekly_personal_handicap_eligible: false,
  official_sequence: "SEASON_WEEK_EASY_HARD",
  status: "LOCAL_CANDIDATE_REQUIRES_SCHEMA_AND_PUBLICATION_GATE_REVIEW",
  import_contract: {
    source_type: "KWT",
    fingerprint_shape: "KWT|OFFICIAL_KWT_CSV:<zip_sha256>|<event>:<detail_file_sha256>:row=<detail_row>|<course_code>:<difficulty>|<immutable_row_digest>",
    source_player_id_kind: "CSV_PARTICIPANT_KEY_NOT_KWT_NUMERIC_ID",
    round_id_kind: "CSV_ROW_EVIDENCE_KEY_NOT_KWT_NUMERIC_ID",
  },
  counts: { fingerprints: rows.length, unique_fingerprints: fingerprintSet.size, old_phase68_collisions: collisions.length },
}
fs.writeFileSync(path.join(output, "package_manifest.json"), JSON.stringify(manifest, null, 2) + "\n")
fs.writeFileSync(path.join(output, "README.md"), `# Phase 112 official KWT CSV candidate\n\nThis is a local, append-only import candidate. It is not applied to Production.\n\nThe source exports do not contain authoritative numeric KWT player IDs or round IDs. The package therefore uses a separately named \`OFFICIAL_KWT_CSV\` evidence namespace embedded in the existing five-part KWT fingerprint contract. Its participant and round keys are deterministic hashes of the exact source files, rows, names, scores, and Season/Week evidence; they are explicitly **not** claimed to be KWT numeric IDs.\n\n- Resolved pair rows: **${resolved.length}**\n- Quarantined unresolved pair rows: **${unresolved.length}**\n- Course observations in candidate: **${rows.length}**\n- Quarantined course observations: **${unresolved.length * 2}**\n- Weekly evidence: not included\n- Production writes: none\n\nBefore any Production use, this namespace requires a separately reviewed compatibility decision against the installed publication gate and historical importer.\n`)
fs.writeFileSync(path.join(output, "phase112_resolution_report.md"), `# Phase 112 Season 14 Weeks 5–12 resolution report\n\n- Source ZIP SHA-256: ${zipSha256}\n- Official player-week pairs reconciled: **${all.length}**\n- Resolved pair rows: **${resolved.length}**\n- Quarantined unresolved pair rows: **${unresolved.length}**\n- Candidate course observations: **${rows.length}**\n- Quarantined course observations: **${unresolved.length * 2}**\n- Existing Phase 68 fingerprint collisions: **${collisions.length}**\n\n## Identifier recovery\n\nThe supplied CSV exports and accessible historical Production/source archives do not contain authoritative numeric KWT source-player IDs or round IDs for these weeks. No numeric identifiers are fabricated. The candidate therefore uses deterministic OFFICIAL_KWT_CSV row evidence keys, which are not claimed to be original KWT identifiers and require separate schema/publication review.\n\n${resolved.length} pair rows are mapped by Phase 68 exact evidence or an exact case-insensitive canonical public.players.screen_name match. ${unresolved.length} pair rows remain quarantined because no authoritative canonical identity evidence was found. Discord IDs are not used as KWT IDs or identity merges.\n\n## Source separation\n\nThis package contains KWT course observations only. No THE_WEEKLY rows are included, and no Weekly observation can enter a personal Handicap history through this package. Season/Week/Easy/Hard sequence metadata is preserved; no calendar dates are invented.\n\n## Production status\n\nNo Production writes, migrations, imports, approvals, or publications were performed.\n`)
const packageRows = fs.readdirSync(output).filter(file => file !== "package_manifest.csv").sort().map(file => {
  const content = fs.readFileSync(path.join(output, file))
  return { artifact: file, count: content.toString("utf8").split("\n").length - 1, sha256: sha256Hex(content.toString("utf8")) }
})
writeCsv("package_manifest.csv", ["artifact", "count", "sha256"], packageRows)
console.log(JSON.stringify({ output, allPairs: all.length, resolvedPairs: resolved.length, unresolvedPairs: unresolved.length, candidateRows: rows.length, quarantinedRows: unresolved.length * 2, collisions: collisions.length }, null, 2))

