import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const proposal = readFileSync("supabase/proposals/20261020_handicap_quarantine_publication_gate.proposed.sql", "utf8")
const withoutComments = proposal.replace(/--[^\r\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "")

test("Phase 74 proposal is a publication gate, not a data recovery script", () => {
  assert.match(proposal, /not for production execution/i)
  assert.match(proposal, /not null default 'QUARANTINED'/i)
  assert.match(proposal, /security_invoker = true/i)
  assert.doesNotMatch(withoutComments, /\b(insert|update|delete|truncate)\b/i)
  assert.doesNotMatch(withoutComments, /create\s+(or\s+replace\s+)?function/i)
})

test("publication views are explicitly closed to client roles", () => {
  for (const view of ["handicap_publishable_rating_snapshots", "handicap_publishable_index_snapshots"]) {
    assert.match(proposal, new RegExp(`revoke all on table public\\.${view} from public, anon, authenticated`, "i"))
    assert.match(proposal, new RegExp(`grant select on table public\\.${view} to service_role`, "i"))
  }
})

test("rating and index readers enforce separate fail-closed contracts", () => {
  assert.match(proposal, /r\.publication_eligibility = 'ELIGIBLE'/i)
  assert.match(proposal, /s\.publication_status = 'PUBLISHED'/i)
  assert.match(proposal, /i\.publication_status = 'PUBLISHED'/i)
  assert.match(proposal, /i\.chronology_confidence = 'EXACT'/i)
  assert.match(proposal, /p\.source_type <> 'KWT'/i)
  assert.match(proposal, /personal_handicap_eligible/i)
})
