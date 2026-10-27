import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const page = readFileSync(join(process.cwd(), "app/kwt/champions/page.tsx"), "utf8")
const css = readFileSync(join(process.cwd(), "app/kwt/champions/page.module.css"), "utf8")

test("KWT championship awards use one canonical responsive awards presentation", () => {
  assert.match(page, /className=\{styles\.showcase\}/)
  assert.match(page, /pageAwards = awards\.filter/)
  assert.match(page, /pageAwards\.map/)
  assert.match(page, /className=\{styles\.trophy\}/)
})

test("KWT championship awards use the available width and stack on mobile", () => {
  assert.match(css, /grid-template-columns: minmax\(0, 1\.2fr\) minmax\(320px, \.9fr\)/)
  assert.match(css, /repeat\(auto-fit, minmax\(190px, 1fr\)\)/)
  assert.match(css, /@media \(max-width: 820px\).*grid-template-columns: 1fr/)
  assert.match(css, /object-fit: contain/)
})
