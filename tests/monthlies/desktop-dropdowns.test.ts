import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const styles = readFileSync(new URL("../../app/monthlies/page.module.css", import.meta.url), "utf8")
const page = readFileSync(new URL("../../app/monthlies/page.tsx", import.meta.url), "utf8")

test("Monthlies keeps desktop selectors above the shared artwork navigation layer", () => {
  assert.match(styles, /\.page :global\(\.artwork-navigation__overlay\)\s*\{\s*z-index:\s*4;/)
  assert.match(styles, /\.page :global\(\.artwork-navigation__overlay\) \.controlsOverlay\s*\{\s*pointer-events:\s*none;/)
  assert.match(styles, /\.controlsOverlay > \*\s*\{\s*pointer-events:\s*auto;/)
  assert.match(styles, /\.artworkSelect\s*\{[\s\S]*?appearance:\s*none;/)
  assert.match(styles, /\.page :global\(\.artwork-navigation__targets\)\s*\{[\s\S]*?pointer-events:\s*none;/)
  assert.match(styles, /\.page :global\(\.artwork-navigation__target\)\s*\{\s*pointer-events:\s*auto;/)
  assert.equal((page.match(/aria-label="(?:Year|Month|Division)"/g) || []).length, 3)
})
