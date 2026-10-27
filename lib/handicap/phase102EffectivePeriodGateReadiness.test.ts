import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

const root = process.cwd()
const proposalPath = path.join(
  root,
  "supabase/proposals/20261020_handicap_kwt_effective_period_publication_gate.proposed.sql",
)

const readProposal = () => fs.readFileSync(proposalPath, "utf8")

test("Phase 102 proposal is the reviewed, checksummed file", () => {
  const proposal = readProposal()
  const checksum = crypto.createHash("sha256").update(proposal).digest("hex").toUpperCase()

  assert.equal(
    checksum,
    "CDB2E480D67A598B604B592DB51B0A9A79C0CFA042299367DF0F4D92E84333AD",
  )
  assert.match(proposal, /^-- PROPOSAL ONLY/m)
  assert.match(proposal, /begin;/i)
  assert.match(proposal, /commit;/i)
})

test("period-only publication remains explicitly gated", () => {
  const proposal = readProposal()

  assert.match(proposal, /s\.effective_from is not null/)
  assert.match(
    proposal,
    /s\.effective_period ~ '\^KWT S\[0-9\]\+W\[0-9\]\+ through S\[0-9\]\+W\[0-9\]\+;/,
  )
  assert.match(proposal, /r\.chronology_policy = 'OFFICIAL_KWT_SEQUENCE'/)
  assert.match(proposal, /allow_official_kwt_sequence_publication/)
  assert.match(proposal, /r\.status = 'COMPLETED'/)
  assert.match(proposal, /r\.publication_eligibility = 'ELIGIBLE'/)
  assert.match(proposal, /s\.publication_status = 'PUBLISHED'/)
  assert.match(proposal, /s\.slope > 0\.01/)
  assert.match(proposal, /cardinality\(s\.source_evidence_refs\) > 0/)
  assert.match(proposal, /security_invoker = true/)
})

test("the proposal preserves client denial and avoids row or schema data mutations", () => {
  const proposal = readProposal()

  assert.match(
    proposal,
    /revoke all on table public\.handicap_publishable_rating_snapshots from public, anon, authenticated/,
  )
  assert.match(proposal, /grant select on table public\.handicap_publishable_rating_snapshots to service_role/)
  assert.doesNotMatch(proposal, /create table|alter table|drop table|insert into|update public\.|delete from|truncate/i)
})

test("the Phase 101 package still carries 72 ready and 6 provisional ratings", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "docs/handicap/phase101/rating_approval_manifest.json"), "utf8"),
  )

  assert.equal(manifest.totalKwtOnlyRatings, 78)
  assert.equal(manifest.readyRatings, 72)
  assert.equal(manifest.provisionalRatings, 6)
  assert.equal(manifest.allRatingsRemainUnpublished, true)
  assert.equal(manifest.formalPublicationEligible, false)
  assert.equal(manifest.effectivePeriod.calendarDate, null)
})
