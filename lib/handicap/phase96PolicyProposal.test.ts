import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const proposal = readFileSync(
  "supabase/proposals/20261020_handicap_official_kwt_sequence_publication_gate.proposed.sql",
  "utf8",
)

test("Phase 96 proposal is limited to chronology constraint and index view", () => {
  assert.match(proposal, /OFFICIAL_KWT_SEQUENCE/)
  assert.match(proposal, /chronology_policy = 'OFFICIAL_KWT_SEQUENCE'/)
  assert.match(proposal, /allow_official_kwt_sequence_publication/)
  assert.match(proposal, /with \(security_invoker = true\)/i)
  assert.match(proposal, /revoke all on table public\.handicap_publishable_index_snapshots from public, anon, authenticated/i)
  assert.doesNotMatch(proposal, /\b(insert|update|delete|truncate)\s+into?\b/i)
})

test("Phase 96 proposal preserves the exact-timestamp publication path", () => {
  assert.match(proposal, /i\.chronology_confidence = 'EXACT'/)
  assert.match(proposal, /i\.publication_status = 'PUBLISHED'/)
  assert.match(proposal, /r\.publication_eligibility = 'ELIGIBLE'/)
})
