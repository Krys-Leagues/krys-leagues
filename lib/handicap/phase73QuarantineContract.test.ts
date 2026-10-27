import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const sql = readFileSync("supabase/proposals/20261020_handicap_quarantine_publication_gate.proposed.sql", "utf8")

test("Phase 73 proposal defaults runs to quarantine and requires explicit eligibility", () => {
  assert.match(sql, /add column publication_eligibility text/i)
  assert.match(sql, /not null default 'QUARANTINED'/i)
  assert.match(sql, /publication_eligibility in \('QUARANTINED', 'ELIGIBLE'\)/i)
  assert.match(sql, /r\.status = 'COMPLETED'/i)
  assert.match(sql, /r\.publication_eligibility = 'ELIGIBLE'/i)
})

test("Phase 73 proposal requires published effective ratings and exact KWT provenance", () => {
  assert.match(sql, /s\.publication_status = 'PUBLISHED'/i)
  assert.match(sql, /s\.effective_from is not null/i)
  assert.match(sql, /p\.canonical_player_id is null/i)
  assert.match(sql, /source_player_id/i)
  assert.match(sql, /THE_WEEKLY/i)
  assert.match(sql, /personal_handicap_eligible/i)
  assert.match(sql, /security_invoker = true/i)
  assert.match(sql, /revoke all on table public\.handicap_publishable_rating_snapshots from public, anon, authenticated/i)
})

test("Phase 73 proposal provides a KWT-only player-index gate", () => {
  assert.match(sql, /create view public\.handicap_publishable_index_snapshots/i)
  assert.match(sql, /i\.chronology_confidence = 'EXACT'/i)
  assert.match(sql, /p\.source_type <> 'KWT'/i)
  assert.match(sql, /grant select on table public\.handicap_publishable_index_snapshots to service_role/i)
})
