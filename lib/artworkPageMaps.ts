import type { ArtworkPageDefinition, ArtworkTarget } from "./artworkNavigation"

export const mainHubArtwork: ArtworkPageDefinition = {
  id: "main-hub",
  title: "Krys Leagues Main Hub",
  imageSrc: "/main-hub-approved.jpg",
  imageAlt: "Krys Leagues main hub with nine navigation panels and an Admin Login panel",
  aspectRatio: "1664 / 938",
  targets: [
    { id: "player-profiles", label: "Player Profiles", href: "/players", x: 11.9, y: 58.7, width: 24.8, height: 8.5 },
    { id: "join-leagues", label: "Join Leagues", href: "/join", x: 38.2, y: 58.7, width: 24.8, height: 8.5 },
    { id: "league-play", label: "League Play", href: "/league-play", x: 64.0, y: 58.7, width: 24.8, height: 8.5 },
    { id: "kwt", label: "KWT", href: "/kwt", x: 11.9, y: 69.3, width: 24.8, height: 8.5 },
    { id: "monthlies", label: "Monthlies", href: "/monthlies", x: 38.2, y: 69.3, width: 24.8, height: 8.5 },
    { id: "bracket-tournaments", label: "Bracket Tournaments", href: "/tournaments", x: 64.0, y: 69.3, width: 24.8, height: 8.5 },
    { id: "overall-leaderboards", label: "Overall Leaderboards", href: "/leaderboards", x: 11.9, y: 80.2, width: 24.8, height: 8.5 },
    { id: "invitationals", label: "Invitationals", href: "/invitationals", x: 38.2, y: 80.2, width: 24.8, height: 8.5 },
    { id: "hall-of-champions", label: "Hall of Champions", href: "/champions", x: 64.0, y: 80.2, width: 24.8, height: 8.5 },
    { id: "admin-login", label: "Admin Login", href: "/admin", x: 42.8, y: 90.7, width: 14.4, height: 7.0 },
  ],
}

export const leaguePlayDestinations: ArtworkTarget[] = [
  { id: "stroke-play", label: "Stroke Play", href: "/stroke", x: 2.9, y: 39.0, width: 30.1, height: 18.6 },
  { id: "match-play", label: "Match Play", href: "/match-play", x: 35.0, y: 39.0, width: 30.2, height: 18.6 },
  { id: "doubles", label: "Doubles", href: "/doubles", x: 67.0, y: 39.0, width: 30.2, height: 18.6 },
  { id: "amateur-pro", label: "Amateur to Pro", href: "/amateur-pro", x: 2.9, y: 68.3, width: 30.1, height: 18.7 },
  { id: "skins", label: "Skins", href: "/skins", x: 35.0, y: 68.3, width: 30.2, height: 18.7 },
  { id: "pyp", label: "PYP / Pick Your Poison", href: "/pyp", x: 67.0, y: 68.3, width: 30.2, height: 18.7 },
]

const actionRows = [
  { prefix: "stroke", x: 3.7, y: 58.1, labels: [["Schedules", "/matches?league=stroke"], ["Standings", "/standings"], ["Results", "/matches?league=stroke"], ["Records", "/records"]] },
  { prefix: "match", x: 35.8, y: 58.1, labels: [["Schedules", "/matches?league=match"], ["Standings", "/match-standings"], ["Results", "/matches?league=match"], ["Records", "/records"]] },
  { prefix: "doubles", x: 67.8, y: 58.1, labels: [["Schedules", "/matches?league=doubles"], ["Standings", "/doubles-standings"], ["Results", "/matches?league=doubles"], ["Records", "/records"]] },
  { prefix: "amateur-pro", x: 3.7, y: 89.6, labels: [["Schedules", "/matches"], ["Standings", "/amateur-pro-standings"], ["Results", "/matches"], ["Records", "/records"]] },
  { prefix: "skins", x: 35.8, y: 89.6, labels: [["League", "/skins"], ["Standings", "/skins-standings"], ["Results", "/skins"]] },
  { prefix: "pyp", x: 67.8, y: 89.6, labels: [["Schedules", "/matches?league=pyp"], ["Standings", "/pyp-standings"], ["Results", "/matches?league=pyp"], ["Records", "/records"]] },
] as const

export const leaguePlayActionTargets: ArtworkTarget[] = actionRows.flatMap((row) =>
  row.labels.map(([label, href], index) => ({
    id: `${row.prefix}-${label.toLowerCase()}`,
    label: `${row.prefix} ${label}`,
    href,
    x: row.x + index * 7.1,
    y: row.y,
    width: 6.3,
    height: 6.7,
  })),
)

export const leaguePlayArtwork: ArtworkPageDefinition = {
  id: "league-play",
  title: "Krys Leagues League Play",
  imageSrc: "/approved-pages/league-play-approved.png",
  imageAlt: "Krys Leagues League Play with six league cards and supported actions",
  aspectRatio: "1664 / 938",
  targets: [
    { id: "back-to-krys-leagues", label: "Back to Krys Leagues", href: "/", x: 1.2, y: 1.4, width: 17.1, height: 7.9 },
    ...leaguePlayDestinations,
    ...leaguePlayActionTargets,
  ],
}

export const joinArtwork: ArtworkPageDefinition = {
  id: "join-leagues",
  title: "Join Krys' Leagues",
  imageSrc: "/approved-pages/join-leagues-approved.jpg",
  imageAlt: "Join Krys' Leagues with seven league registration choices and a Discord sign-in panel",
  aspectRatio: "1200 / 1307",
  targets: [
    { id: "back-to-krys-leagues", label: "Back to Krys Leagues", href: "/", x: 2.1, y: 2.6, width: 18.4, height: 4.9 },
    { id: "match-play-league", label: "Join Match Play League", href: "/register?league=match", x: 4.6, y: 46.3, width: 9.2, height: 4.5 },
    { id: "stroke-league", label: "Join Stroke League", href: "/register?league=stroke", x: 37.4, y: 46.3, width: 8.5, height: 4.5 },
    { id: "pick-your-poison", label: "Join Pick Your Poison", href: "/register?league=pyp", x: 69.0, y: 46.3, width: 8.5, height: 4.5 },
    { id: "doubles-league", label: "Join Doubles League", href: "/register?league=doubles", x: 4.6, y: 70.8, width: 9.2, height: 4.3 },
    { id: "pro-league", label: "Join Pro League", href: "/register?league=pro", x: 37.4, y: 70.8, width: 8.5, height: 4.3 },
    { id: "bracket-cup-players", label: "Join Bracket / Cup Players", href: "/register?league=cups", x: 69.0, y: 70.8, width: 8.5, height: 4.3 },
    { id: "community-records-leaderboards", label: "Join Community, Records, and Leaderboards", href: "/register?league=community", x: 3.8, y: 90.6, width: 8.5, height: 4.0 },
  ],
}

export const kwtArtwork: ArtworkPageDefinition = {
  id: "kwt-hub",
  title: "KWT · Krys Weekly Tournament",
  imageSrc: "/approved-pages/kwt-hub-approved.jpg",
  imageAlt: "KWT Krys Weekly Tournament hub with Current Tournament, Upcoming Events, Past Champions, and Records cards",
  aspectRatio: "1150 / 1356",
  targets: [
    { id: "past-champions", label: "Past Champions", href: "/champions?league=kwt", x: 10.9, y: 56.1, width: 80.9, height: 15.2 },
    { id: "records", label: "Records", href: "/records", x: 10.9, y: 72.7, width: 80.9, height: 15.8 },
  ],
}
