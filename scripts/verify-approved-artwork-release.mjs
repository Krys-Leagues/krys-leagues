import { execFileSync, spawnSync } from "node:child_process"

const root = process.cwd()
const args = process.argv.slice(2)
const argValue = (name) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}
const productionInput = argValue("--production-commit") || process.env.PRODUCTION_COMMIT_SHA
const candidateInput = argValue("--candidate-commit") || process.env.CANDIDATE_COMMIT_SHA
const errors = []

const resolveCommit = (value) => {
  if (!value || !/^[0-9a-f]{40}$/i.test(value)) return null
  try {
    return execFileSync("git", ["rev-parse", "--verify", value + "^{commit}"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return null
  }
}

const productionCommit = resolveCommit(productionInput)
const candidateCommit = resolveCommit(candidateInput)

if (!productionInput) errors.push("Current live Production commit is required.")
else if (!productionCommit) errors.push("Current live Production commit cannot be resolved: " + productionInput)

if (!candidateInput) errors.push("Exact deployment candidate commit is required.")
else if (!candidateCommit) errors.push("Exact deployment candidate commit cannot be resolved: " + candidateInput)

if (productionCommit && candidateCommit) {
  const ancestry = spawnSync("git", ["merge-base", "--is-ancestor", productionCommit, candidateCommit], {
    cwd: root,
    stdio: "ignore",
  })
  if (ancestry.status !== 0) {
    errors.push("Candidate " + candidateCommit + " is not descended from current live Production " + productionCommit + ".")
  }
}

const sourceAtCandidate = (relativePath) => {
  if (!candidateCommit) return null
  try {
    return execFileSync("git", ["show", candidateCommit + ":" + relativePath], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
  } catch {
    return null
  }
}

const requireSourceMarkers = (relativePath, markers) => {
  const source = sourceAtCandidate(relativePath)
  if (source === null) {
    errors.push(relativePath + " is unavailable in the exact candidate tree.")
    return
  }
  for (const marker of markers) {
    if (!source.includes(marker)) errors.push(relativePath + " is missing approved marker " + JSON.stringify(marker) + ".")
  }
}

const requiredSources = {
  "app/page.tsx": ["ArtworkNavigation", "mainHubArtwork"],
  "app/league-play/page.tsx": ["ArtworkNavigation", "leaguePlayArtwork"],
  "app/players/page.tsx": ["ArtworkNavigation", "playerProfilesArtwork", "loadCanonicalPublicPlayers", "filteredPlayers"],
  "app/leaderboards/page.tsx": ['redirect("/records")'],
  "app/records/page.tsx": ["ArtworkNavigation", "overallLeaderboardsArtwork"],
  "app/kwt/page.tsx": ["ArtworkNavigation", "kwtArtwork"],
  "app/kwt/upcoming/page.tsx": ["KWT_WEEKLY_FEATURE_ASSET", "KWT_SEASON_TROPHY_BOARD_ASSET", "Back to KWT"],
  "app/kwt/records/page.tsx": ["get_public_kwt_course_records", "buildKwtCourseRecords", "Back to KWT"],
  "app/tournaments/page.tsx": ["ArtworkNavigation", "bracketTournamentsArtwork", "BracketRegistrationOverlay"],
  "app/tournaments/current/page.tsx": ["CURRENT_TOURNAMENTS", "LiveBracketPreview", "live-preview"],
  "app/tournaments/history/page.tsx": ["ARCHIVED_TOURNAMENTS", "View Full Bracket", "/tournaments"],
  "app/tournaments/BracketRegistrationOverlay.tsx": ["bracket_public_content", "target=\"_blank\""],
  "app/invitationals/page.tsx": ["ArtworkNavigation", "invitationalsArtwork"],
  "app/champions/page.tsx": ["hallOfChampionsArtworkAsset", "resolveHallScope", "FilteredHallCategory", "Hall of Champions categories"],
  "app/join/page.tsx": ["ArtworkNavigation", "joinArtwork"],
  "app/monthlies/page.tsx": ["ArtworkNavigation", "monthlyArtwork", "Monthly result filters"],
  "app/match-play/page.tsx": ["ArtworkNavigation", "matchPlayArtwork"],
  "app/pyp/page.tsx": ["ArtworkNavigation", "pypArtwork"],
  "app/skins/page.tsx": ["ArtworkNavigation", "skinsArtwork"],
  "app/amateur-pro/page.tsx": ["ArtworkNavigation", "amateurToProArtwork"],
  "app/doubles/page.tsx": ["ArtworkNavigation", "doublesArtwork"],
  "app/stroke/page.tsx": ["ArtworkNavigation", "strokeArtwork"],
  "lib/artworkPageMaps.ts": [
    'id: "main-hub"',
    'id: "league-play"',
    'id: "join-leagues"',
    'id: "kwt-hub"',
    'id: "monthly-results"',
    'id: "bracket-tournaments"',
    'id: "invitationals"',
    'id: "match-play"',
    'id: "overall-leaderboards"',
    'id: "player-profiles"',
    'id: "pyp"',
    'id: "skins"',
    'id: "amateur-to-pro"',
    'id: "doubles"',
    'id: "stroke"',
    "kwt-hub-approved.png",
    "monthly-results-approved.png",
    "bracket-tournaments-approved.png",
    "hall-of-champions-approved.jpg",
  ],
  "components/navigation/ArtworkNavigation.tsx": ["data-approved-artwork-page={definition.id}", "artwork-navigation__overlay"],
  "app/monthlies/page.module.css": ["min-height: 0", "pointer-events: none", "pointer-events: auto", "top: 16%", "left: 19%", "width: 20%", "height: 68%"],
}

for (const [relativePath, markers] of Object.entries(requiredSources)) requireSourceMarkers(relativePath, markers)

const legacyChecks = [
  ["app/page.tsx", ["const buttonGrid", "Season 59"]],
  ["app/leaderboards/page.tsx", ["Player Dashboard", "const buttonGrid", "Season 59"]],
  ["app/monthlies/page.tsx", ["monthly-results-approved.jpg", "August 2026 is the active Monthly"]],
  ["app/kwt/page.tsx", ["kwt-hub-approved.jpg", "weekendMask", "Krys Weekly Tournament"]],
  ["app/tournaments/page.tsx", ["bracket-tournaments-approved.jpg", "/admin/krys-tourney"]],
  ["app/join/page.tsx", ["community-records-leaderboards", "/register?league=community"]],
]

for (const [relativePath, markers] of legacyChecks) {
  const source = sourceAtCandidate(relativePath)
  if (source === null) continue
  for (const marker of markers) {
    if (source.includes(marker)) errors.push(relativePath + " contains retired public marker " + JSON.stringify(marker) + ".")
  }
}

for (const asset of [
  "public/main-hub-approved.jpg",
  "public/approved-pages/league-play-approved.png",
  "public/approved-pages/join-leagues-approved.jpg",
  "public/approved-pages/player-profiles-approved.jpg",
  "public/approved-pages/overall-leaderboards-approved.jpg",
  "public/approved-pages/kwt-hub-approved.png",
  "public/approved-pages/monthly-results-approved.png",
  "public/approved-pages/bracket-tournaments-approved.png",
  "public/approved-pages/invitationals-approved.jpg",
  "public/approved-pages/hall-of-champions-approved.jpg",
  "public/approved-pages/match-play-approved.jpg",
  "public/approved-pages/pyp-approved.jpg",
  "public/approved-pages/skins-approved.jpg",
  "public/approved-pages/amateur-to-pro-approved.jpg",
  "public/approved-pages/doubles-approved.jpg",
  "public/approved-pages/stroke-play-approved.jpg",
]) {
  if (!candidateCommit) continue
  try {
    execFileSync("git", ["cat-file", "-e", candidateCommit + ":" + asset], { cwd: root, stdio: "ignore" })
  } catch {
    errors.push("Required approved asset is missing from candidate tree: " + asset + ".")
  }
}

if (errors.length > 0) {
  console.error("BLOCKED: exact-candidate public release guard failed.")
  for (const error of errors) console.error("- " + error)
  process.exit(1)
}

console.log("READY: exact candidate " + candidateCommit + " descends from current live Production " + productionCommit + "; approved public route markers and assets passed.")