import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "../..")
const read = (path) => readFileSync(resolve(root, path), "utf8")

test("Player Profiles restores the approved artwork-backed hub", () => {
  const page = read("app/players/page.tsx")
  const maps = read("lib/artworkPageMaps.ts")
  const css = read("app/players/page.module.css")

  assert.match(page, /ArtworkNavigation/u)
  assert.match(page, /playerProfilesArtwork/u)
  assert.match(page, /loadCanonicalPublicPlayers/u)
  assert.match(page, /href=\{`\/players\/\$\{player\.id\}`\}/u)
  assert.match(maps, /imageSrc: "\/approved-pages\/player-profiles-approved\.jpg"/u)
  assert.match(css, /\.searchOverlay\s*\{/u)
  assert.match(css, /\.results\s*\{/u)
})

test("Player Profiles uses the exact approved artwork bytes", () => {
  const bytes = readFileSync(resolve(root, "public/approved-pages/player-profiles-approved.jpg"))
  assert.equal(
    createHash("sha256").update(bytes).digest("hex").toUpperCase(),
    "77E2A10F63B5B806DFBB65F55D10022A8FF61C237D8760B165B0C3BE2073AC1C",
  )
})

test("Profile pages retain the public Course Challenges navigation", () => {
  assert.match(read("app/players/[id]/page.tsx"), /href="\/course-challenges"[^>]*>Course Challenges/u)
})
