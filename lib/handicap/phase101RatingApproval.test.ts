import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

const root = process.cwd()
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8")

test("Phase 101 produces a complete unpublished 78-row approval manifest", () => {
  const manifest = JSON.parse(read("docs/handicap/phase101/rating_approval_manifest.json"))
  assert.equal(manifest.totalKwtOnlyRatings, 78)
  assert.equal(manifest.readyRatings, 72)
  assert.equal(manifest.provisionalRatings, 6)
  assert.equal(manifest.readyRecommendedForFormalApproval, 72)
  assert.equal(manifest.diagnosticRatings, 4)
  assert.equal(manifest.numericIndexCandidates, 157)
  assert.equal(manifest.effectivePeriod.calendarDate, null)
  assert.equal(manifest.allRatingsRemainUnpublished, true)
  assert.equal(manifest.formalPublicationEligible, false)
  assert.equal(manifest.sourceExceptions.unresolvedCanonicalId, 806)
  assert.equal(manifest.sourceExceptions.invalidScore, 2)
})

test("the proposed gate preserves calendar dates and adds only explicitly opted-in period-only publication", () => {
  const proposal = read("supabase/proposals/20261020_handicap_kwt_effective_period_publication_gate.proposed.sql")
  assert.match(proposal, /s\.effective_from is not null/)
  assert.match(proposal, /s\.effective_period ~ '\^KWT S\[0-9\]\+W\[0-9\]\+ through/)
  assert.match(proposal, /r\.chronology_policy = 'OFFICIAL_KWT_SEQUENCE'/)
  assert.match(proposal, /allow_official_kwt_sequence_publication/)
  assert.match(proposal, /security_invoker = true/)
  assert.match(proposal, /revoke all on table public\.handicap_publishable_rating_snapshots from public, anon, authenticated/)
  assert.doesNotMatch(proposal, /insert into|update public\.|delete from|truncate/i)
})

test("the four diagnostic ratings are documented as no-defect review items", () => {
  const csv = read("docs/handicap/phase101/rating_approval_manifest.csv")
  for (const course of ["Shangri-La", "Forgotten Fairyland", "Bogey's Bonanza", "Original Gothic"]) {
    assert.match(csv, new RegExp(`${course.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*APPROVE_AFTER_DIAGNOSTIC_REVIEW`))
  }
  assert.doesNotMatch(csv, /(^|,)PUBLISHED(,|$)/m)
})

test("the Season/Week manifest never invents calendar dates", () => {
  const manifest = JSON.parse(read("docs/handicap/phase101/season_week_effective_period_manifest.json"))
  assert.equal(manifest.effectiveFrom, null)
  assert.equal(manifest.noCalendarDatesInvented, true)
  assert.equal(manifest.rows.length, 78)
  for (const row of manifest.rows) {
    assert.equal(row.chronology_policy, "OFFICIAL_KWT_SEQUENCE")
    assert.equal(row.effective_from, null)
    assert.match(row.proposed_effective_period, /OFFICIAL_KWT_SEQUENCE; calendar date unavailable$/)
  }
})
