import assert from "node:assert/strict"
import test from "node:test"

import {
  CLIMBERS_BASELINE_REVIEW_ROWS,
  CLIMBERS_BASELINE_REVIEW_CUTOFF,
  CLIMBERS_BASELINE_SOURCE_PLAYERS,
  combinedBaselinePoints,
  normalizeBaselineIdentity,
} from "./climbers-baseline-review.ts"

test("Climbers review preserves all 17 exact source names and point values", () => {
  assert.equal(CLIMBERS_BASELINE_REVIEW_ROWS.length, 17)
  assert.equal(CLIMBERS_BASELINE_SOURCE_PLAYERS, 79)
  assert.equal(CLIMBERS_BASELINE_REVIEW_CUTOFF, "2026-08-15T00:00:00.000Z")
  assert.deepEqual(CLIMBERS_BASELINE_REVIEW_ROWS[0], { sourceName: "ZOEDARLIN", julyYtdPoints: 1868, augustThrough14Points: 0 })
  assert.deepEqual(CLIMBERS_BASELINE_REVIEW_ROWS.at(-1), { sourceName: "ANDREWBCA", julyYtdPoints: 0, augustThrough14Points: 61 })
  assert.equal(combinedBaselinePoints(CLIMBERS_BASELINE_REVIEW_ROWS[3]), 287)
  assert.equal(combinedBaselinePoints(CLIMBERS_BASELINE_REVIEW_ROWS.at(-1)!), 61)
  assert.equal(CLIMBERS_BASELINE_REVIEW_ROWS.filter((row) => row.sourceName === "AWSOME KRIS").length, 1)
})

test("review identity normalization is discovery-only and keeps source spelling separate", () => {
  assert.equal(normalizeBaselineIdentity("DREW 0706"), "drew0706")
  assert.equal(normalizeBaselineIdentity("AWSOME KRIS"), "awsomekris")
  assert.notEqual(normalizeBaselineIdentity("AWSOME KRIS"), normalizeBaselineIdentity("AWESOME KRIS"))
})

test("review UI persists through the protected verified-alias RPC and not browser storage", async () => {
  const { readFile } = await import("node:fs/promises")
  const source = await readFile(new URL("../../app/admin/records/climbers/LegacyBaselineIdentityReview.tsx", import.meta.url), "utf8")
  assert.match(source, /remember_verified_player_alias/)
  assert.match(source, /loadGlobalPlayerDirectory/)
  assert.doesNotMatch(source, /localStorage|sessionStorage/)
  assert.doesNotMatch(source, /create_player|insert\(/i)
})

test("final baseline migration contains every verified source mapping and remains gated", async () => {
  const { readFile } = await import("node:fs/promises")
  const sql = await readFile(new URL("../../climbers_existing_baseline_2026_08_14.sql", import.meta.url), "utf8")
  const mappingSection = sql.match(/with resolved\(source_name,canonical_player_id\) as \(([\s\S]*?)\)\s*update/)?.[1] ?? ""
  const mappingCount = [...mappingSection.matchAll(/\('[^']+',\s*'[^']+'::uuid\)/g)].length
  assert.equal(mappingCount, 79)
  for (const row of CLIMBERS_BASELINE_REVIEW_ROWS) assert.match(mappingSection, new RegExp(`\\('${row.sourceName.replace(/[.*+?^${}()|[\\]\\]/g, "\\\\$&")}',`))
  assert.match(sql, /identity_status<>'resolved'/)
  assert.match(sql, /applied_at is not null/)
  assert.match(sql, /combined_points = ytd_points \+ period_points/)
  assert.match(sql, /cutoff_at timestamptz not null/)
  assert.match(mappingSection, /\('METUM','ba5a3695-4e76-4820-a489-5eac43aec5cc'::uuid\)/)
  assert.doesNotMatch(mappingSection, /ba5a3695-4e76-4820-a489-5eac88d42b23/)
})
