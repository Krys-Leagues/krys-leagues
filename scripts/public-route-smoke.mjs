import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const root = process.cwd()
const read = (path) => readFileSync(resolve(root, path), "utf8")
const exists = (path) => existsSync(resolve(root, path))

const routes = [
  { route: "/", asset: "/main-hub-approved.jpg", files: ["app/page.tsx", "lib/artworkPageMaps.ts"], links: ["/players", "/join", "/league-play", "/kwt", "/monthlies", "/tournaments", "/records", "/invitationals", "/champions"], legacy: [] },
  { route: "/players", asset: "/approved-pages/player-profiles-approved.jpg", files: ["app/players/page.tsx", "app/players/page.module.css", "lib/artworkPageMaps.ts"], links: ["loadCanonicalPublicPlayers", "filteredPlayers", "Search players by screen name", "/players/"], legacy: ["No active players found", "style={directory}"] },
  { route: "/records", asset: "/approved-pages/overall-leaderboards-approved.jpg", files: ["app/leaderboards/page.tsx", "app/records/page.tsx", "lib/artworkPageMaps.ts"], links: ["redirect(\"/records\")", "/records/single", "/records/combined"], legacy: ["Player Dashboard", "Season 59", "landingGrid"] },
  { route: "/kwt", asset: "/approved-pages/kwt-hub-approved.png", files: ["app/kwt/page.tsx", "app/kwt/upcoming/page.tsx", "app/kwt/records/page.tsx", "lib/artworkPageMaps.ts"], links: ["kwt-hub-approved.png", "Current Tournament", "/kwt/upcoming", "/champions?league=kwt&from=kwt", "/kwt/records"], legacy: ["kwt-hub-approved.jpg"] },
  { route: "/tournaments", asset: "/approved-pages/bracket-tournaments-approved.png", files: ["app/tournaments/page.tsx", "app/tournaments/current/page.tsx", "app/tournaments/history/page.tsx", "app/tournaments/BracketRegistrationOverlay.tsx", "lib/artworkPageMaps.ts"], links: ["bracket-tournaments-approved.png", "/majors?from=tournaments", "/tournaments/current", "/tournaments/current#live-preview", "/invitationals", "/tournaments/history"], legacy: ["bracket-tournaments-approved.jpg", "/admin/krys-tourney"] },
  { route: "/champions", asset: "/approved-pages/hall-of-champions-approved.jpg", files: ["app/champions/page.tsx", "lib/championScope.ts"], links: ["hall-of-champions-approved.jpg", "resolveHallScope", "from === \"tournaments\"", "Browse Trophy Categories"], legacy: ["Player Dashboard", "Season 59"] },
  { route: "/join", asset: "/approved-pages/join-leagues-approved.jpg", files: ["app/join/page.tsx", "lib/artworkPageMaps.ts"], links: ["join-leagues-approved.jpg", "/register?league=match", "/register?league=stroke", "/register?league=pyp", "/register?league=doubles", "/register?league=pro", "/register?league=cups"], legacy: ["community-records-leaderboards", "/register?league=community"] },
  { route: "/monthlies", asset: "/approved-pages/monthly-results-approved.png", files: ["app/monthlies/page.tsx", "app/monthlies/page.module.css", "lib/artworkPageMaps.ts", "app/api/monthlies/public/route.ts"], links: ["monthly-results-approved.png", "Year", "Month", "Division", "Monthly result filters"], legacy: ["monthly-results-approved.jpg", "August 2026 is the active Monthly"] },
  { route: "/match-play", asset: "/approved-pages/match-play-approved.jpg", files: ["app/match-play/page.tsx", "lib/artworkPageMaps.ts"], links: ["match-play-approved.jpg", "/league-play", "/matches", "/match-standings"], legacy: ["Player Dashboard"] },
  { route: "/pyp", asset: "/approved-pages/pyp-approved.jpg", files: ["app/pyp/page.tsx", "lib/artworkPageMaps.ts"], links: ["pyp-approved.jpg", "/pyp-standings", "/players", "/records"], legacy: ["Player Dashboard"] },
  { route: "/skins", asset: "/approved-pages/skins-approved.jpg", files: ["app/skins/page.tsx", "lib/artworkPageMaps.ts"], links: ["skins-approved.jpg", "/skins-standings", "/players", "/records"], legacy: ["Player Dashboard"] },
  { route: "/amateur-pro", asset: "/approved-pages/amateur-to-pro-approved.jpg", files: ["app/amateur-pro/page.tsx", "lib/artworkPageMaps.ts"], links: ["amateur-to-pro-approved.jpg", "/matches", "/amateur-pro-standings", "/players", "/records"], legacy: ["Elite Competition"] },
  { route: "/doubles", asset: "/approved-pages/doubles-approved.jpg", files: ["app/doubles/page.tsx", "lib/artworkPageMaps.ts"], links: ["doubles-approved.jpg", "/doubles-standings", "/matches", "/players", "/records"], legacy: ["Player Dashboard"] },
  { route: "/stroke", asset: "/approved-pages/stroke-play-approved.jpg", files: ["app/stroke/page.tsx", "lib/artworkPageMaps.ts"], links: ["stroke-play-approved.jpg", "/standings", "/matches", "/players", "/records"], legacy: ["Player Dashboard"] },
  { route: "/league-play", asset: "/approved-pages/league-play-approved.png", files: ["app/league-play/page.tsx", "lib/artworkPageMaps.ts"], links: ["league-play-approved.png", "/stroke", "/match-play", "/doubles", "/amateur-pro", "/skins", "/pyp"], legacy: ["Choose a league to view schedules"] },
]

const results = routes.map((item) => {
  const source = item.files.map(read).join("\n")
  const missingFiles = item.files.filter((path) => !exists(path))
  const missingLinks = item.links.filter((fragment) => !source.includes(fragment))
  const legacyMarker = item.legacy.find((fragment) => source.includes(fragment)) || null
  const assetPath = item.asset === "/main-hub-approved.jpg" ? "public/main-hub-approved.jpg" : `public${item.asset}`
  const assetPresent = exists(assetPath)
  if (missingFiles.length || missingLinks.length || legacyMarker || !assetPresent) {
    throw new Error(`${item.route}: files=${missingFiles.join(",") || "ok"}; links=${missingLinks.join(",") || "ok"}; legacy=${legacyMarker || "none"}; asset=${assetPresent}`)
  }
  return { ...item, approvedAsset: item.asset, legacyMarkerAbsent: "YES", missingFiles, missingLinks }
})

const markdown = [
  "# Rapid Public Route Smoke Manifest",
  "",
  "Generated from the live-based recovery worktree by `scripts/public-route-smoke.mjs`.",
  "This is static source/asset evidence; it does not access Production or execute data operations.",
  "",
  "| Route | Approved asset | Expected primary links/markers | Legacy marker absent |",
  "| --- | --- | --- | --- |",
  ...results.map((item) => "| " + item.route + " | " + item.approvedAsset + " | " + item.links.join("; ") + " | " + item.legacyMarkerAbsent + " |"),
  "",
].join("\n")

const report = resolve(root, "docs/public-site-recovery/rapid-route-smoke-manifest.md")
writeFileSync(report, markdown)
console.log(JSON.stringify({ routes: results.length, report: "docs/public-site-recovery/rapid-route-smoke-manifest.md", status: "PASS" }))