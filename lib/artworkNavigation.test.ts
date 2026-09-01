import test from "node:test"
import assert from "node:assert/strict"
import { artworkTargetStyle, validateArtworkTargets } from "./artworkNavigation.ts"
import { leaguePlayArtwork, mainHubArtwork } from "./artworkPageMaps.ts"

test("approved artwork maps are valid and non-overlapping", () => {
  assert.deepEqual(validateArtworkTargets(mainHubArtwork.targets), [])
  assert.deepEqual(validateArtworkTargets(leaguePlayArtwork.targets), [])
})

test("main hub has exactly the approved destinations", () => {
  assert.deepEqual(mainHubArtwork.targets.map((target) => target.href), [
    "/players",
    "/join",
    "/league-play",
    "/kwt",
    "/monthlies",
    "/tournaments",
    "/leaderboards",
    "/invitationals",
    "/champions",
    "/admin",
  ])
  assert.equal(mainHubArtwork.targets.some((target) => ["/dashboard", "/standings"].includes(target.href)), false)
})

test("back and league targets use explicit routes", () => {
  assert.equal(leaguePlayArtwork.targets.find((target) => target.id === "back-to-krys-leagues")?.href, "/")
  assert.equal(leaguePlayArtwork.targets.find((target) => target.id === "stroke-play")?.href, "/stroke")
  assert.equal(mainHubArtwork.targets.find((target) => target.id === "kwt")?.href, "/kwt")
})

test("percentage mapping is responsive and deterministic", () => {
  const target = mainHubArtwork.targets.find((item) => item.id === "kwt")!
  assert.deepEqual(artworkTargetStyle(target), { left: "11.9%", top: "69.3%", width: "24.8%", height: "8.5%" })
})

test("overlapping targets are rejected", () => {
  assert.deepEqual(
    validateArtworkTargets([
      { id: "a", label: "A", href: "/a", x: 0, y: 0, width: 20, height: 20 },
      { id: "b", label: "B", href: "/b", x: 10, y: 10, width: 20, height: 20 },
    ]),
    ["overlapping targets: a and b"],
  )
})
