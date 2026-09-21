import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const root = process.cwd()
const entry = readFileSync(`${root}/app/admin/records/entry/page.tsx`, "utf8")

test("All-Time buttons initiate protected validation automatically", () => {
  assert.match(entry, /async function saveEntry\(action: FastEntryAction\)/)
  assert.match(entry, /await previewEntry\(\)/)
  assert.match(entry, /p_confirmation_token: generatedPreview\?\.confirmation_token/)
  assert.match(entry, /ADD AGAIN SC/)
  assert.match(entry, /ADD &amp; FINISH/)
  assert.doesNotMatch(entry, /checked=\{confirmed\}/)
  assert.doesNotMatch(entry, /Preview protected entry/)
  assert.doesNotMatch(entry, /check the confirmation box before saving/)
})

test("All-Time chronology and stale-fingerprint protections remain present", () => {
  assert.match(entry, /source-post date/)
  assert.match(entry, /source-post date .*outside the selected period/)
  assert.match(entry, /fingerprint/)
  assert.match(entry, /Duplicate prevented/)
})
