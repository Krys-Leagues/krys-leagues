import assert from "node:assert/strict"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const root = process.cwd()
const read = (path) => readFileSync(join(root, path), "utf8")

function routeFiles(directory, prefix = "") {
  const entries = readdirSync(directory, { withFileTypes: true })
  const routes = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      routes.push(...routeFiles(path, `${prefix}/${entry.name}`))
    } else if (entry.name === "page.tsx") {
      routes.push(prefix || "/")
    }
  }
  return routes
}

const requiredRoutes = [
  "/",
  "/players",
  "/league-play",
  "/match-play",
  "/stroke",
  "/doubles",
  "/pyp",
  "/skins",
  "/amateur-pro",
  "/kwt",
  "/kwt/upcoming",
  "/kwt/records",
  "/tournaments",
  "/tournaments/current",
  "/tournaments/history",
  "/invitationals",
  "/majors",
  "/champions",
  "/course-challenges",
  "/records",
  "/records/single",
  "/records/combined",
  "/leaderboards",
]

const assets = [
  "public/main-hub-approved.jpg",
  "public/approved-pages/player-profiles-approved.jpg",
  "public/approved-pages/league-play-approved.png",
  "public/approved-pages/match-play-approved.jpg",
  "public/approved-pages/stroke-play-approved.jpg",
  "public/approved-pages/doubles-approved.jpg",
  "public/approved-pages/pyp-approved.jpg",
  "public/approved-pages/skins-approved.jpg",
  "public/approved-pages/amateur-to-pro-approved.jpg",
  "public/approved-pages/kwt-hub-approved.png",
  "public/approved-pages/bracket-tournaments-approved.png",
  "public/approved-pages/invitationals-approved.jpg",
  "public/approved-pages/overall-leaderboards-approved.jpg",
  "public/approved-pages/hall-of-champions-approved.jpg",
  "public/approved-pages/the mga open.jpg",
  "public/approved-pages/gardens-of-babylon-background.png",
]

test("every approved public route has a committed page", () => {
  const routes = new Set(routeFiles(join(root, "app")))
  for (const route of requiredRoutes) assert.ok(routes.has(route), `missing route ${route}`)
})

test("approved artwork assets remain present and non-empty", () => {
  for (const asset of assets) {
    const path = join(root, asset)
    assert.ok(existsSync(path), `missing approved asset ${asset}`)
    assert.ok(statSync(path).size > 0, `empty approved asset ${asset}`)
  }
})

test("public navigation targets real local routes or approved external destinations", () => {
  const map = read("lib/artworkPageMaps.ts")
  const homepage = read("app/page.tsx")
  const mgaBanner = read("components/home/MgaHomepageBanner.tsx")
  const expected = [
    'href: "/players"',
    'href: "/league-play"',
    'href: "/kwt"',
    'href: "/tournaments"',
    'href: "/records"',
    'href: "/invitationals"',
    'href: "/champions"',
    'href: "/kwt/upcoming"',
    'href: "/kwt/records"',
  ]
  for (const target of expected) assert.match(map, new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing target ${target}`)
  assert.match(homepage, /<MgaHomepageBanner \/>/)
  assert.match(mgaBanner, /href="\/majors\/major-2"/)
  assert.match(map, /oraclecloudapps\.com\/ords\/r\/wmgt\/kwt\/home/)
})

test("leaderboards is a public alias for the approved records landing page", () => {
  assert.match(read("app/leaderboards/page.tsx"), /redirect\("\/records"\)/)
  assert.match(read("lib/featureVisibility/registry.ts"), /\{ key: "records", path: "\/records", visibility: "live" \}/)
  assert.match(read("app/records/page.tsx"), /overallLeaderboardsArtwork/)
})

test("MGA Open public data path preserves the live four-day signup contract", () => {
  const route = read("app/api/majors/data/route.ts")
  const page = read("app/majors/[slug]/page.tsx")
  const timezone = read("components/MajorTimeZoneControl.tsx")
  assert.match(route, /resource === "detail"/)
  assert.match(route, /major_time_slots/)
  assert.match(page, /major_events/)
  assert.match(page, /major_time_slots/)
  assert.match(timezone, /Your Local Time Zone/)
  assert.match(timezone, /All playing times will be shown in your selected time zone\./)
  assert.match(timezone, /Confirm/)
  assert.doesNotMatch(timezone, /IANA timezone identifier|browser detected|event fallback/)
  assert.doesNotMatch(page, /Player-local time:/)
})

