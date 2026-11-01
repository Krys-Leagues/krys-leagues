import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(path, "utf8")

test("Join renders the approved artwork through the shared navigation architecture", () => {
  const page = read("app/join/page.tsx")
  const map = read("lib/artworkPageMaps.ts")
  assert.match(page, /ArtworkNavigation/)
  assert.match(page, /joinArtwork/)
  assert.match(page, /JoinArtworkOverlay/)
  assert.match(map, /join-leagues-approved\.jpg/)
  assert.equal(existsSync("public/approved-pages/join-leagues-approved.jpg"), true)
  assert.equal(existsSync("app/join/page.module.css"), false)
  assert.doesNotMatch(page, /optionGrid|optionCard|ambientGlow|JOIN_OPTIONS/)
})

test("Join keeps live Discord auth and the corrected seven registration routes", () => {
  const page = read("app/join/page.tsx")
  const map = read("lib/artworkPageMaps.ts")
  assert.match(page, /supabase\.auth\.getUser/)
  assert.match(page, /signInWithOAuth/)
  assert.match(page, /supabase\.auth\.signOut/)
  for (const route of ["match", "stroke", "pyp", "doubles", "pro", "cups", "community"]) {
    assert.match(map, new RegExp(`/register\\?league=${route}`))
  }
})
