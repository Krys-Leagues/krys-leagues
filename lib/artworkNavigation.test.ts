import test from "node:test"
import assert from "node:assert/strict"
import { artworkTargetStyle, validateArtworkHitboxes, validateArtworkTargets } from "./artworkNavigation.ts"
import { amateurToProArtwork, bracketTournamentsArtwork, doublesArtwork, invitationalsArtwork, joinArtwork, kwtArtwork, leaguePlayActionTargets, leaguePlayArtwork, leaguePlayDestinations, mainHubArtwork, matchPlayArtwork, monthlyArtwork, monthlyArtworkOverlayTargets, overallLeaderboardsArtwork, playerProfilesArtwork, pypArtwork, skinsArtwork, strokeArtwork } from "./artworkPageMaps.ts"
import { readFileSync } from "node:fs"

const read = (path: string) => readFileSync(path, "utf8")

test("approved artwork maps are valid and non-overlapping", () => {
  assert.deepEqual(validateArtworkTargets(mainHubArtwork.targets), [])
  assert.deepEqual(validateArtworkTargets(leaguePlayArtwork.targets), [])
  assert.deepEqual(validateArtworkTargets(joinArtwork.targets), [])
  assert.deepEqual(validateArtworkTargets(kwtArtwork.targets), [])
  assert.deepEqual(validateArtworkTargets(bracketTournamentsArtwork.targets), [])
  assert.deepEqual(validateArtworkTargets(invitationalsArtwork.targets), [])
  assert.deepEqual(validateArtworkTargets(matchPlayArtwork.targets), [])
  assert.deepEqual(validateArtworkTargets(pypArtwork.targets), [])
  assert.deepEqual(validateArtworkTargets(skinsArtwork.targets), [])
  assert.deepEqual(validateArtworkTargets(amateurToProArtwork.targets), [])
  assert.deepEqual(validateArtworkTargets(doublesArtwork.targets), [])
  assert.deepEqual(validateArtworkTargets(strokeArtwork.targets), [])
  assert.deepEqual(validateArtworkTargets(monthlyArtwork.targets), [])
  assert.deepEqual(validateArtworkTargets(overallLeaderboardsArtwork.targets), [])
  assert.deepEqual(validateArtworkTargets(playerProfilesArtwork.targets), [])
  assert.deepEqual(validateArtworkHitboxes(monthlyArtworkOverlayTargets), [])
})

test("active Main Hub route is artwork-only and keeps the approved destinations", () => {
  const page = read("app/page.tsx")
  assert.equal(mainHubArtwork.id, "main-hub")
  assert.match(page, /ArtworkNavigation/)
  assert.match(page, /mainHubArtwork/)
  assert.match(page, /course-challenges\/course-challenges-hub-extension-preview\.png/)
  assert.match(page, /href="\/course-challenges"/)
  assert.match(page, /alt="Course Challenges"/)
  assert.match(page, /href="\/admin"/)
  assert.match(page, /hiddenTargetIds=\{\["admin-login"\]\}/)
  assert.doesNotMatch(page, /Season 59|Player Dashboard|League Records|card-grid|fallback/i)
  assert.deepEqual(mainHubArtwork.targets.map(({ label, href }) => [label, href]), [
    ["Player Profiles", "/players"],
    ["Join Leagues", "/join"],
    ["League Play", "/league-play"],
    ["KWT", "/kwt"],
    ["Monthlies", "https://dqvo64m7q9ujvqa-wmgt23ai.adb.us-ashburn-1.oraclecloudapps.com/ords/r/wmgt/monthly/home"],
    ["Bracket Tournaments", "/tournaments"],
    ["Overall Leaderboards", "/records"],
    ["Invitationals", "/invitationals"],
    ["Hall of Champions", "/champions"],
    ["Admin Login", "/admin"],
  ])
})

test("Course Challenges banner preview precedes the preserved Admin Login action", () => {
  const page = read("app/page.tsx")
  assert.ok(page.indexOf("course-challenges\/course-challenges-hub-extension-preview.png") < page.indexOf("ADMIN LOGIN"))
  assert.match(read("components/navigation/artwork-navigation.css"), /artwork-navigation__course-challenges-preview-banner/)
  assert.match(read("components/navigation/artwork-navigation.css"), /artwork-navigation__after-frame/)
})

test("Main Hub extension uses explicit lower-layer structure without a covering footer mask", () => {
  const component = read("components/navigation/ArtworkNavigation.tsx")
  const styles = read("components/navigation/artwork-navigation.css")
  assert.match(component, /artwork-navigation__hub-stack/)
  assert.match(styles, /\.artwork-navigation__frame \{[\s\S]*z-index: 2;/)
  assert.match(styles, /\.artwork-navigation__after-frame \{[\s\S]*z-index: 1;/)
  assert.doesNotMatch(styles, /artwork-navigation__main-hub-footer-cover/)
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
    "https://dqvo64m7q9ujvqa-wmgt23ai.adb.us-ashburn-1.oraclecloudapps.com/ords/r/wmgt/monthly/home",
    "/tournaments",
    "/records",
    "/invitationals",
    "/champions",
    "/admin",
  ])
  assert.equal(mainHubArtwork.targets.some((target) => ["/dashboard", "/standings"].includes(target.href)), false)
})

test("Main Hub Overall Leaderboards opens the current page, not the legacy hub", () => {
  const target = mainHubArtwork.targets.find((item) => item.id === "overall-leaderboards")
  const alias = read("app/leaderboards/page.tsx")
  const page = read("app/records/page.tsx")

  assert.equal(target?.href, "/records")
  assert.match(alias, /redirect\("\/records"\)/)
  assert.match(page, /ArtworkNavigation/)
  assert.match(page, /overallLeaderboardsArtwork/)
  assert.equal(overallLeaderboardsArtwork.imageSrc, "/approved-pages/overall-leaderboards-approved.jpg")
  assert.equal(overallLeaderboardsArtwork.aspectRatio, "1698 / 2046")
  assert.deepEqual(overallLeaderboardsArtwork.targets.map(({ id, label, href }) => [id, label, href]), [
    ["back-to-krys-leagues", "Back to Krys Leagues", "/"],
    ["single-course-records", "Single Course Records", "/records/single"],
    ["combined-records", "Combined Records", "/records/combined"],
  ])
  assert.equal(overallLeaderboardsArtwork.targets.some((target) => target.label === "Speed Running Leaderboard"), false)
  assert.doesNotMatch(page, /Player Dashboard|Season 59|Active Players|Active Leagues|Matches Remaining|Matches Completed|League Records/i)
  assert.doesNotMatch(page, /landingGrid|landingCard|PublicRecordsHero|Course Records|Speed Running Leaderboard/)
})

test("Player Profiles uses the approved artwork with an overlaid canonical search", () => {
  const page = read("app/players/page.tsx")
  assert.equal(playerProfilesArtwork.imageSrc, "/approved-pages/player-profiles-approved.jpg")
  assert.equal(playerProfilesArtwork.aspectRatio, "2064 / 793")
  assert.match(page, /ArtworkNavigation/)
  assert.match(page, /playerProfilesArtwork/)
  assert.match(page, /loadCanonicalPublicPlayers/)
  assert.match(page, /Search players by screen name/)
  assert.match(page, /href=\{`\/players\/\$\{player\.id\}`\}/)
  assert.match(page, /href="\/".*Back to Krys Leagues/)
  assert.doesNotMatch(page, /No active players found|style=\{directory\}/)
})

test("back and league targets use explicit routes", () => {
  assert.equal(leaguePlayArtwork.targets.find((target) => target.id === "back-to-krys-leagues")?.href, "/")
  assert.equal(leaguePlayArtwork.targets.find((target) => target.id === "stroke-play")?.href, "/stroke")
  assert.equal(mainHubArtwork.targets.find((target) => target.id === "kwt")?.href, "/kwt")
})

test("Join artwork keeps the six registration destinations and removes community signup", () => {
  assert.equal(joinArtwork.imageSrc, "/approved-pages/join-leagues-approved.jpg")
  assert.equal(joinArtwork.targets.find((target) => target.id === "back-to-krys-leagues")?.href, "/")
  assert.deepEqual(joinArtwork.targets.filter((target) => target.id !== "back-to-krys-leagues").map(({ label, href }) => [label, href]), [
    ["Join Match Play League", "/register?league=match"],
    ["Join Stroke League", "/register?league=stroke"],
    ["Join Pick Your Poison", "/register?league=pyp"],
    ["Join Doubles League", "/register?league=doubles"],
    ["Join Pro League", "/register?league=pro"],
    ["Join Bracket / Cup Players", "/register?league=cups"],
  ])
  assert.equal(joinArtwork.targets.some((target) => target.id === "community-records-leaderboards"), false)
})

test("KWT artwork scopes the real public destinations", () => {
  const page = read("app/kwt/page.tsx")
  assert.equal(kwtArtwork.imageSrc, "/approved-pages/kwt-hub-approved.png")
  assert.match(page, /ArtworkNavigation/)
  assert.match(page, /kwtArtwork/)
  assert.equal(kwtArtwork.targets.find((target) => target.id === "current-tournament")?.href, "https://dqvo64m7q9ujvqa-wmgt23ai.adb.us-ashburn-1.oraclecloudapps.com/ords/r/wmgt/kwt/home")
  assert.equal(kwtArtwork.targets.find((target) => target.id === "current-tournament")?.external, true)
  assert.equal(kwtArtwork.targets.find((target) => target.id === "upcoming-events")?.href, "/kwt/upcoming")
  assert.equal(kwtArtwork.targets.find((target) => target.id === "past-champions")?.href, "/champions?league=kwt&from=kwt")
  assert.equal(kwtArtwork.targets.find((target) => target.id === "records")?.href, "/kwt/records")
  assert.equal(kwtArtwork.targets.some((target) => target.href.startsWith("/admin")), false)
})

test("Bracket Tournaments uses the approved artwork and preserves only existing public links", () => {
  const page = read("app/tournaments/page.tsx")
  assert.equal(bracketTournamentsArtwork.imageSrc, "/approved-pages/bracket-tournaments-approved.png")
  assert.equal(bracketTournamentsArtwork.aspectRatio, "1374 / 1145")
  assert.match(page, /ArtworkNavigation/)
  assert.match(page, /bracketTournamentsArtwork/)
  assert.match(page, /BracketRegistrationOverlay/)
  assert.doesNotMatch(page, /gridTemplateColumns|admin\/krys-tourney/i)
  assert.deepEqual(bracketTournamentsArtwork.targets.map(({ id, label, href }) => [id, label, href]), [
    ["back-to-krys-leagues", "Back to Krys Leagues", "/"],
    ["four-majors", "Four Majors", "/majors?from=tournaments"],
    ["current-brackets", "Current Brackets", "/tournaments/current"],
    ["live-bracket-preview", "Live Bracket Preview", "/tournaments/current#live-preview"],
    ["invitational-qualification", "Invitational Qualification", "/invitationals"],
    ["past-tournament-winners", "Past Tournament Winners", "/tournaments/history"],
  ])
  assert.equal(bracketTournamentsArtwork.targets.some((target) => target.href.startsWith("/admin")), false)
  assert.equal(bracketTournamentsArtwork.targets.some((target) => target.id === "open-registration"), false)
})

test("Invitationals uses the approved artwork and preserves only existing public links", () => {
  const page = read("app/invitationals/page.tsx")
  assert.equal(invitationalsArtwork.imageSrc, "/approved-pages/invitationals-approved.jpg")
  assert.equal(invitationalsArtwork.aspectRatio, "1698 / 2048")
  assert.match(page, /ArtworkNavigation/)
  assert.match(page, /invitationalsArtwork/)
  assert.deepEqual(invitationalsArtwork.targets.map(({ id, label, href }) => [id, label, href]), [
    ["back-to-krys-leagues", "Back to Krys Leagues", "/"],
    ["champion-of-champions", "Champion of Champions", "/champions?category=champion-of-champions&from=invitationals"],
    ["krys-cup", "Krys Cup", "/champions?category=krys-cup&from=invitationals"],
    ["spicy-cup", "Spicy Cup", "/champions?category=spicy-cup&from=invitationals"],
    ["earn-your-invite", "Earn Your Invite", "/tournaments"],
  ])
  assert.equal(invitationalsArtwork.targets.some((target) => target.href.startsWith("/admin")), false)
  assert.equal(invitationalsArtwork.targets.some((target) => target.id === "past-winners"), false)
  assert.doesNotMatch(page, /Champion of Champions|Krys Cup|Spicy Cup|Earn Your Invite|gridTemplateColumns|linkCard/)
})

test("Match Play uses the approved artwork and wires only its three existing public controls", () => {
  const page = read("app/match-play/page.tsx")
  assert.equal(matchPlayArtwork.imageSrc, "/approved-pages/match-play-approved.jpg")
  assert.equal(matchPlayArtwork.aspectRatio, "1507 / 1044")
  assert.match(page, /ArtworkNavigation/)
  assert.match(page, /matchPlayArtwork/)
  assert.match(page, /Current Season/)
  assert.deepEqual(matchPlayArtwork.targets.map(({ id, label, href }) => [id, label, href]), [
    ["back-to-league-play", "Back to League Play", "/league-play"],
    ["matches-and-results", "Matches and Results", "/matches"],
    ["classic-standings", "Classic standings", "/match-standings"],
  ])
  assert.deepEqual(validateArtworkTargets(matchPlayArtwork.targets), [])
  assert.doesNotMatch(page, /BIG LOGO TRANSPARENT|topNav|href=\"\/matches\"|href=\"\/match-standings\"/)
})

test("PYP uses the approved artwork and preserves its existing public destinations", () => {
  const page = read("app/pyp/page.tsx")
  assert.equal(pypArtwork.imageSrc, "/approved-pages/pyp-approved.jpg")
  assert.equal(pypArtwork.aspectRatio, "1142 / 1377")
  assert.match(page, /ArtworkNavigation/)
  assert.match(page, /pypArtwork/)
  assert.deepEqual(pypArtwork.targets.map(({ id, label, href }) => [id, label, href]), [
    ["back-to-league-play", "Back to League Play", "/league-play"],
    ["public-standings", "View Public PYP Standings", "/pyp-standings"],
    ["player-profiles", "Explore Player Profiles", "/players"],
    ["league-records", "See PYP League Records", "/records"],
  ])
  assert.deepEqual(validateArtworkTargets(pypArtwork.targets), [])
  assert.doesNotMatch(page, /grid|PYP Standings|League Records|React\.CSSProperties/)
})

test("Skins uses the approved artwork and preserves only existing public destinations", () => {
  const page = read("app/skins/page.tsx")
  assert.equal(skinsArtwork.imageSrc, "/approved-pages/skins-approved.jpg")
  assert.equal(skinsArtwork.aspectRatio, "1141 / 1378")
  assert.match(page, /ArtworkNavigation/)
  assert.match(page, /skinsArtwork/)
  assert.deepEqual(skinsArtwork.targets.map(({ id, label, href }) => [id, label, href]), [
    ["back-to-league-play", "Back to League Play", "/league-play"],
    ["skins-leaderboard", "Open Skins Leaderboard", "/skins-standings"],
    ["player-totals", "Open Player Totals", "/players"],
    ["skins-records", "Open Skins Records", "/records"],
  ])
  assert.deepEqual(validateArtworkTargets(skinsArtwork.targets), [])
  assert.equal(skinsArtwork.targets.some(({ id }) => id === "results"), false)
  assert.doesNotMatch(page, /grid|Skins Leaderboard|Player Totals|React\.CSSProperties/)
})

test("Amateur to Pro uses the approved artwork and preserves existing public destinations", () => {
  const page = read("app/amateur-pro/page.tsx")
  const styles = read("app/amateur-pro/page.module.css")
  assert.equal(amateurToProArtwork.imageSrc, "/approved-pages/amateur-to-pro-approved.jpg")
  assert.equal(amateurToProArtwork.aspectRatio, "1142 / 1378")
  assert.match(page, /ArtworkNavigation/)
  assert.match(page, /amateurToProArtwork/)
  assert.match(styles, /artwork-navigation/)
  assert.deepEqual(amateurToProArtwork.targets.map(({ id, label, href }) => [id, label, href]), [
    ["back-to-league-play", "Back to League Play", "/league-play"],
    ["matches-and-results", "Open Amateur to Pro Matches and Results", "/matches"],
    ["public-standings", "Open Amateur to Pro Public Standings", "/amateur-pro-standings"],
    ["player-progression", "Open Player Progression", "/players"],
    ["league-records", "Open Amateur to Pro League Records", "/records"],
  ])
  assert.deepEqual(validateArtworkTargets(amateurToProArtwork.targets), [])
  assert.doesNotMatch(page, /grid|Amateur → Pro|React\.CSSProperties/)
})

test("Doubles uses the approved artwork and preserves existing public destinations", () => {
  const page = read("app/doubles/page.tsx")
  const styles = read("app/doubles/page.module.css")
  assert.equal(doublesArtwork.imageSrc, "/approved-pages/doubles-approved.jpg")
  assert.equal(doublesArtwork.aspectRatio, "1700 / 2048")
  assert.match(page, /ArtworkNavigation/)
  assert.match(page, /doublesArtwork/)
  assert.match(styles, /artwork-navigation/)
  assert.deepEqual(doublesArtwork.targets.map(({ id, label, href }) => [id, label, href]), [
    ["back-to-league-play", "Back to League Play", "/league-play"],
    ["matches-and-results", "Open Doubles Matches and Results", "/matches"],
    ["public-standings", "Open Doubles Public Standings", "/doubles-standings"],
    ["teams-and-players", "Open Doubles Teams and Players", "/players"],
    ["league-records", "Open Doubles League Records", "/records"],
  ])
  assert.deepEqual(validateArtworkTargets(doublesArtwork.targets), [])
  assert.doesNotMatch(page, /grid|Doubles Standings|Teams & Players|React\.CSSProperties/)
})

test("Stroke Play uses the approved artwork and preserves existing public destinations", () => {
  const page = read("app/stroke/page.tsx")
  const styles = read("app/stroke/page.module.css")
  assert.equal(strokeArtwork.imageSrc, "/approved-pages/stroke-play-approved.jpg")
  assert.equal(strokeArtwork.aspectRatio, "1696 / 2047")
  assert.match(page, /ArtworkNavigation/)
  assert.match(page, /strokeArtwork/)
  assert.match(styles, /artwork-navigation/)
  assert.deepEqual(strokeArtwork.targets.map(({ id, label, href }) => [id, label, href]), [
    ["back-to-league-play", "Back to League Play", "/league-play"],
    ["matches-and-results", "Open Stroke Matches and Results", "/matches"],
    ["public-standings", "Open Stroke Public Standings", "/standings"],
    ["league-records", "Open Stroke League Records", "/records"],
    ["player-profiles", "Open Stroke Player Profiles", "/players"],
  ])
  assert.deepEqual(validateArtworkTargets(strokeArtwork.targets), [])
  assert.doesNotMatch(page, /grid|Stroke Play Standings|League Records|React\.CSSProperties/)
})

test("Monthly Results uses the approved artwork and non-overlapping filter controls", () => {
  const page = read("app/monthlies/page.tsx")
  const styles = read("app/monthlies/page.module.css")
  assert.equal(monthlyArtwork.imageSrc, "/approved-pages/monthly-results-approved.png")
  assert.equal(monthlyArtwork.aspectRatio, "1641 / 959")
  assert.match(page, /ArtworkNavigation/)
  assert.match(page, /monthlyArtwork/)
  assert.match(page, /data-monthly-results=\"expanded\"/)
  assert.equal(monthlyArtwork.targets.find(target => target.id === "back-to-krys-leagues")?.href, "/")
  assert.deepEqual(validateArtworkHitboxes(monthlyArtworkOverlayTargets), [])
  assert.deepEqual(monthlyArtworkOverlayTargets.filter(({ id }) => ["year", "month", "division"].includes(id)).map(({ id, x, y, width, height }) => [id, x, y, width, height]), [
    ["year", 7.0, 66.8, 27.5, 7.3],
    ["month", 36.3, 66.8, 27.5, 7.3],
    ["division", 65.6, 66.8, 27.5, 7.3],
  ])
  assert.match(styles, /\.page :global\(\.artwork-navigation__overlay\) \.controlsOverlay \{\s*pointer-events: none;/)
  assert.match(styles, /\.controlsOverlay > \* \{\s*pointer-events: auto;/)
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
