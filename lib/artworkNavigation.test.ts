import test from "node:test"
import assert from "node:assert/strict"
import { artworkTargetStyle, validateArtworkTargets } from "./artworkNavigation.ts"
import { leaguePlayActionTargets, leaguePlayArtwork, leaguePlayDestinations, mainHubArtwork } from "./artworkPageMaps.ts"
import { readFileSync } from "node:fs"

const read = (path: string) => readFileSync(path, "utf8")

test("approved artwork maps are valid and non-overlapping", () => {
  assert.deepEqual(validateArtworkTargets(mainHubArtwork.targets), [])
  assert.deepEqual(validateArtworkTargets(leaguePlayArtwork.targets), [])
})

test("active Main Hub route is artwork-only and keeps the approved destinations", () => {
  const page = read("app/page.tsx")
  assert.equal(mainHubArtwork.id, "main-hub")
  assert.match(page, /ArtworkNavigation/)
  assert.match(page, /mainHubArtwork/)
  assert.doesNotMatch(page, /Season 59|Player Dashboard|League Records|card-grid|fallback/i)
  assert.deepEqual(mainHubArtwork.targets.map(({ label, href }) => [label, href]), [
    ["Player Profiles", "/players"],
    ["Join Leagues", "/join"],
    ["League Play", "/league-play"],
    ["KWT", "/kwt"],
    ["Monthlies", "/monthlies"],
    ["Bracket Tournaments", "/tournaments"],
    ["Overall Leaderboards", "/leaderboards"],
    ["Invitationals", "/invitationals"],
    ["Hall of Champions", "/champions"],
    ["Admin Login", "/admin"],
  ])
})

test("active League Play route is artwork-only with exactly six league destinations", () => {
  const page = read("app/league-play/page.tsx")
  assert.equal(leaguePlayArtwork.id, "league-play")
  assert.match(page, /ArtworkNavigation/)
  assert.match(page, /leaguePlayArtwork/)
  assert.doesNotMatch(page, /Choose a league to view schedules|gridTemplateColumns|card-grid|fallback/i)
  assert.deepEqual(leaguePlayDestinations.map(({ label, href }) => [label, href]), [
    ["Stroke Play", "/stroke"],
    ["Match Play", "/match-play"],
    ["Doubles", "/doubles"],
    ["Amateur to Pro", "/amateur-pro"],
    ["Skins", "/skins"],
    ["PYP / Pick Your Poison", "/pyp"],
  ])
  assert.deepEqual(leaguePlayActionTargets.map(({ label, href }) => [label, href]), [
    ["stroke Schedules", "/matches?league=stroke"], ["stroke Standings", "/standings"], ["stroke Results", "/matches?league=stroke"], ["stroke Records", "/records"],
    ["match Schedules", "/matches?league=match"], ["match Standings", "/match-standings"], ["match Results", "/matches?league=match"], ["match Records", "/records"],
    ["doubles Schedules", "/matches?league=doubles"], ["doubles Standings", "/doubles-standings"], ["doubles Results", "/matches?league=doubles"], ["doubles Records", "/records"],
    ["amateur-pro Schedules", "/matches"], ["amateur-pro Standings", "/amateur-pro-standings"], ["amateur-pro Results", "/matches"], ["amateur-pro Records", "/records"],
    ["skins League", "/skins"], ["skins Standings", "/skins-standings"], ["skins Results", "/skins"],
    ["pyp Schedules", "/matches?league=pyp"], ["pyp Standings", "/pyp-standings"], ["pyp Results", "/matches?league=pyp"], ["pyp Records", "/records"],
  ])
})

test("artwork navigation exposes stable page identity markers", () => {
  const component = read("components/navigation/ArtworkNavigation.tsx")
  assert.match(component, /data-approved-artwork-page=\{definition\.id\}/)
  assert.match(component, /definition\.imageSrc/)
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
