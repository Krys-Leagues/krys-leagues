import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const route = await readFile(new URL("../../app/tournaments/[slug]/page.tsx", import.meta.url), "utf8")

test("Current Brackets uses the authoritative read-only tournament records", () => {
  assert.match(route, /const TOURNAMENT_SLUG = "5-4-3-2-1"/u)
  assert.match(route, /from\("tournaments"\)/u)
  assert.match(route, /from\("tournament_rounds"\)/u)
  assert.match(route, /from\("tournament_matches"\)/u)
  assert.match(route, /from\("players"\)/u)
  assert.match(route, /tournament_match_results/u)
  assert.match(route, /VisualBracket/u)
  assert.match(route, /krys-leagues-match-center\.vercel\.app/u)
  assert.doesNotMatch(route, /insert\(|update\(|upsert\(|delete\(/u)
})

test("Current Brackets renders all rounds through the visual bracket component", async () => {
  const component = await readFile(new URL("../../components/tournaments/VisualBracket.tsx", import.meta.url), "utf8")
  assert.match(component, /Quarterfinals/u)
  assert.match(component, /Semifinals/u)
  assert.match(component, /Open private Match Center/u)
})
