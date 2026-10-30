import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "../..")
const read = (path) => readFileSync(resolve(root, path), "utf8")
const hash = (path) => createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex").toUpperCase()

test("approved Player Hub artwork bytes remain unchanged", () => {
  assert.equal(hash("public/main-hub-approved.jpg"), "EE16574A32BF7091414F487D64C0ADAAF081537F8E948C969B75547E7AA2826F")
  assert.equal(hash("public/course-challenges/course-challenges-hub-extension-preview.png"), "6DA958E75CFFC07453C84D3433B611D256923122CB449D28A787FE76EB199CE9")
})

test("Player Hub appearance preserves the approved artwork stack and order", () => {
  const page = read("app/page.tsx")
  const maps = read("lib/artworkPageMaps.ts")
  const css = read("components/navigation/artwork-navigation.css")

  assert.match(page, /frameAspectRatio="1664 \/ 850"/u)
  assert.match(page, /artwork-navigation__main-hub-frame--cropped/u)
  assert.match(page, /src="\/course-challenges\/course-challenges-hub-extension-preview\.png"/u)
  assert.ok(page.indexOf("<MgaHomepageBanner />") < page.indexOf("<YouTubeLiveLauncher />"))
  assert.ok(page.indexOf("<YouTubeLiveLauncher />") < page.indexOf("ADMIN LOGIN"))

  const labels = ["Player Profiles", "Join Leagues", "League Play", "KWT", "Monthlies", "Bracket Tournaments", "Overall Leaderboards", "Invitationals", "Hall of Champions"]
  for (const label of labels) assert.match(maps, new RegExp(`label: "${label}"`, "u"))
  assert.match(maps, /id: "player-profiles", label: "Player Profiles", href: "\/players", x: 11\.9, y: 58\.7, width: 24\.8, height: 8\.5/u)
  assert.match(maps, /id: "join-leagues", label: "Join Leagues", href: "\/join", x: 38\.2, y: 58\.7, width: 24\.8, height: 8\.5/u)
  assert.match(maps, /id: "league-play", label: "League Play", href: "\/league-play", x: 64\.0, y: 58\.7, width: 24\.8, height: 8\.5/u)
  assert.match(maps, /id: "kwt", label: "KWT", href: "\/kwt", x: 11\.9, y: 69\.3, width: 24\.8, height: 8\.5/u)
  assert.match(maps, /id: "monthlies", label: "Monthlies"[^\n]+x: 38\.2, y: 69\.3, width: 24\.8, height: 8\.5/u)
  assert.match(maps, /id: "bracket-tournaments", label: "Bracket Tournaments", href: "\/tournaments", x: 64\.0, y: 69\.3, width: 24\.8, height: 8\.5/u)
  assert.match(maps, /id: "overall-leaderboards", label: "Overall Leaderboards", href: "\/records", x: 11\.9, y: 80\.2, width: 24\.8, height: 8\.5/u)
  assert.match(maps, /id: "invitationals", label: "Invitationals", href: "\/invitationals", x: 38\.2, y: 80\.2, width: 24\.8, height: 8\.5/u)
  assert.match(maps, /id: "hall-of-champions", label: "Hall of Champions", href: "\/champions", x: 64\.0, y: 80\.2, width: 24\.8, height: 8\.5/u)

  assert.match(css, /\.artwork-navigation__hub-stack\s*\{/u)
  assert.match(css, /\.artwork-navigation__main-hub-frame--cropped \.artwork-navigation__image/u)
  assert.match(css, /\.artwork-navigation__main-hub-actions\s*\{/u)
})

test("Player Hub checkpoint is appearance-only", () => {
  const registry = JSON.parse(read("release/approved-feature-registry.json"))
  const feature = registry.features.find((entry) => entry.id === "player-hub-artwork-layout")
  assert.equal(feature.approval.ownerApproved, true)
  assert.equal(feature.scope, "artwork and layout appearance only; button destinations and functionality are not approved by this checkpoint")
  assert.ok(feature.requiredInteractions.every((entry) => entry.includes("appearance")))
})
