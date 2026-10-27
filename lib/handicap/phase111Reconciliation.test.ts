import assert from "node:assert/strict"
import test from "node:test"
import { decodeCsvBytes, parseCsvText, reconcileKwtWeek, weekFromEvent } from "./phase111Reconciliation.ts"

test("Phase 111 decodes invalid UTF-8 source files as Windows-1252 without replacement characters", () => {
  const bytes = new Uint8Array([0x50, 0x6c, 0x75, 0x63, 0x6b, 0x79, 0xbf])
  const decoded = decodeCsvBytes(bytes)
  assert.equal(decoded.encoding, "WINDOWS-1252")
  assert.equal(decoded.text, "Plucky¿")
  assert.ok(!decoded.text.includes("�"))
})

test("Phase 111 maps internal KWT week identifiers instead of filename order", () => {
  assert.deepEqual(weekFromEvent("KWT14W05"), { season: 14, week: 5, eventId: "KWT14W05" })
  assert.equal(weekFromEvent("not-a-week"), null)
})

test("Phase 111 reconciles exact player, course, score, and total fields", () => {
  const detail = parseCsvText("Player,Easy Code,Hard Code,Easy,Hard,Total Score,E1,E2\nName,ABC,ABD,-10,-8,-18,-5,-5\n", "UTF-8").rows
  const summary = parseCsvText("Week,Easy Course,Hard Course,Player,Easy,Hard,Total,Avatar\nKWT14W05,ABC,ABD,Name,-10,-8,-18,avatar\n", "UTF-8").rows
  const [row] = reconcileKwtWeek({ detailFile: "d.csv", summaryFile: "s.csv", detailRows: detail, summaryRows: summary })
  assert.equal(row.summaryMatch, "EXACT")
  assert.equal(row.easyScore, -10)
  assert.equal(row.holeSumStatus, "NOT_AVAILABLE")
  assert.equal(row.sourceIdStatus, "MISSING_IN_SOURCE_FILE")
})

test("Phase 111 does not treat source-file absence of IDs as importable evidence", () => {
  const detail = parseCsvText("Player,Easy Code,Hard Code,Easy,Hard,Total Score\nName,ABC,ABD,-10,-8,-18\n", "UTF-8").rows
  const summary = parseCsvText("Week,Easy Course,Hard Course,Player,Easy,Hard,Total\nKWT14W05,ABC,ABD,Name,-10,-8,-18\n", "UTF-8").rows
  const [row] = reconcileKwtWeek({ detailFile: "d.csv", summaryFile: "s.csv", detailRows: detail, summaryRows: summary })
  assert.equal(row.importEligibility, "BLOCKED_MISSING_AUTHORITATIVE_SOURCE_ID_AND_ROUND_ID")
})
