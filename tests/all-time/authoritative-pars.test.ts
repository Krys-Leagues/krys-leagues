import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync("all_time_authoritative_hole_pars.sql", "utf8")
const catalog = readFileSync("all_time_complete_course_catalog.sql", "utf8")
const payloadText = migration.match(/v_expected jsonb := \$json\$([\s\S]*?)\$json\$::jsonb/)?.[1]
assert.ok(payloadText, "the authoritative migration must contain its JSON payload")
const authoritative = JSON.parse(payloadText) as { code: string; par: number; hole_pars: number[] }[]
const catalogCodes = [...catalog.matchAll(/\('([A-Z0-9]+)',/g)].map((match) => match[1])

test("authoritative All-Time pars contain the complete safe 82-course catalog", () => {
  assert.equal(authoritative.length, 82)
  assert.equal(new Set(authoritative.map((row) => row.code)).size, 82)
  assert.equal(authoritative.some((row) => row.code === "SBE"), false)
  assert.equal(authoritative.some((row) => row.code === "RCE"), true)
  assert.equal(authoritative.some((row) => row.code === "RCH"), true)
  assert.equal(authoritative.reduce((sum, row) => sum + row.hole_pars.length, 0), 1476)
  for (const row of authoritative) {
    assert.equal(row.hole_pars.length, 18, row.code)
    assert.ok(row.hole_pars.every((par) => Number.isInteger(par) && par > 0), row.code)
    assert.equal(row.hole_pars.reduce((sum, par) => sum + par, 0), row.par, row.code)
  }
})

test("authoritative pars match every local canonical All-Time course code", () => {
  assert.deepEqual(new Set(authoritative.map((row) => row.code)), new Set(catalogCodes))
})
