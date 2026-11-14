import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const page = await readFile(new URL("../../app/tournaments/page.tsx", import.meta.url), "utf8")
const styles = await readFile(new URL("../../app/tournaments/page.module.css", import.meta.url), "utf8")

test("Area 15 uses the approved artwork as a background with real navigation links", () => {
  assert.match(page, /bracket-tournaments-approved\.png/u)
  assert.match(page, /href: "\/register\?league=cups"/u)
  assert.match(page, /href: "\/tournaments\/5-4-3-2-1"/u)
  assert.match(page, /href: "\/invitationals"/u)
  assert.match(page, /href: "\/champions\?category=bracket&from=tournaments"/u)
  assert.match(page, /<\/section>\s*<nav className=\{styles\.panelGrid\}/u)
  assert.match(page, /<Link key=\{panel\.title\}/u)
})

test("Area 15 button layout is responsive and preserves focus treatment", () => {
  assert.match(styles, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/u)
  assert.match(styles, /@media \(max-width: 820px\)/u)
  assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/u)
  assert.match(styles, /\.panel:focus-visible/u)
  assert.match(styles, /\.artwork\s*\{/u)
  assert.match(styles, /object-fit: contain/u)
  assert.match(styles, /\.panelGrid\s*\{\s*width: 100%/u)
  assert.doesNotMatch(styles, /\.panelGrid\s*\{[^}]*position: absolute/u)
})
