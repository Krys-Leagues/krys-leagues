import type { ArtworkHitbox, ArtworkPageDefinition, ArtworkTarget } from "./artworkNavigation"

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
    { id: "overall-leaderboards", label: "Overall Leaderboards", href: "/records", x: 11.9, y: 80.2, width: 24.8, height: 8.5 },
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
  ],
}

export const kwtArtwork: ArtworkPageDefinition = {
  id: "kwt-hub",
  title: "KWT · Krys Weekend Tournament",
  imageSrc: "/approved-pages/kwt-hub-approved.png",
  imageAlt: "KWT Krys Weekend Tournament hub with Current Tournament, Upcoming Events, Past Champions, and Records cards",
  aspectRatio: "1149 / 1369",
  targets: [
    { id: "current-tournament", label: "Current Tournament", href: "https://dqvo64m7q9ujvqa-wmgt23ai.adb.us-ashburn-1.oraclecloudapps.com/ords/r/wmgt/kwt/home", external: true, x: 10.9, y: 22.0, width: 80.9, height: 15.2 },
    { id: "upcoming-events", label: "Upcoming Events", href: "/kwt/upcoming", x: 10.9, y: 39.0, width: 80.9, height: 15.2 },
    { id: "past-champions", label: "Past Champions", href: "/champions?league=kwt&from=kwt", x: 10.9, y: 56.1, width: 80.9, height: 15.2 },
    { id: "records", label: "Records and Achievements", href: "/kwt/records", x: 10.9, y: 72.7, width: 80.9, height: 15.8 },
  ],
}

export const bracketTournamentsArtwork: ArtworkPageDefinition = {
  id: "bracket-tournaments",
  title: "Krys Leagues Bracket Tournaments",
  imageSrc: "/approved-pages/bracket-tournaments-approved.png",
  imageAlt: "Krys Leagues Bracket Tournaments with Four Majors, Open Registration, Current Brackets, Invitational Qualification, Live Bracket Preview, and Past Tournament Winners",
  aspectRatio: "1374 / 1145",
    targets: [
      { id: "back-to-krys-leagues", label: "Back to Krys Leagues", href: "/", x: 1.0, y: 1.0, width: 13.0, height: 7.5 },
      { id: "four-majors", label: "Four Majors", href: "/majors?from=tournaments", x: 1.2, y: 73.2, width: 18.5, height: 15.8 },
      { id: "current-brackets", label: "Current Brackets", href: "/tournaments/current", x: 40.4, y: 73.2, width: 18.5, height: 15.8 },
      { id: "live-bracket-preview", label: "Live Bracket Preview", href: "/tournaments/current#live-preview", x: 20.5, y: 28.0, width: 59.0, height: 35.0 },
      { id: "invitational-qualification", label: "Invitational Qualification", href: "/invitationals", x: 60.3, y: 73.2, width: 18.5, height: 15.8 },
      { id: "past-tournament-winners", label: "Past Tournament Winners", href: "/tournaments/history", x: 80.2, y: 73.2, width: 18.5, height: 15.8 },
    ],
  }

export const invitationalsArtwork: ArtworkPageDefinition = {
  id: "invitationals",
  title: "Krys Leagues Invitationals",
  imageSrc: "/approved-pages/invitationals-approved.jpg",
  imageAlt: "Krys Leagues Invitationals with Champion of Champions, Krys Cup, Spicy Cup, Past Winners, and Earn Your Invite artwork",
  aspectRatio: "1698 / 2048",
  targets: [
    { id: "back-to-krys-leagues", label: "Back to Krys Leagues", href: "/", x: 1.8, y: 1.5, width: 15.4, height: 4.2 },
    { id: "champion-of-champions", label: "Champion of Champions", href: "/champions?category=champion-of-champions&from=invitationals", x: 1.9, y: 23.7, width: 26.4, height: 17.5 },
    { id: "krys-cup", label: "Krys Cup", href: "/champions?category=krys-cup&from=invitationals", x: 29.3, y: 23.7, width: 26.5, height: 17.5 },
    { id: "spicy-cup", label: "Spicy Cup", href: "/champions?category=spicy-cup&from=invitationals", x: 56.4, y: 23.7, width: 26.3, height: 17.5 },
    { id: "earn-your-invite", label: "Earn Your Invite", href: "/tournaments", x: 20.5, y: 73.0, width: 58.0, height: 6.0 },
  ],
}

export const matchPlayArtwork: ArtworkPageDefinition = {
  id: "match-play",
  title: "Krys Leagues Match Play",
  imageSrc: "/approved-pages/match-play-approved.jpg",
  imageAlt: "Krys Leagues Match Play with League Play, Matches and Results, Classic standings, and Current Season artwork",
  aspectRatio: "1507 / 1044",
  targets: [
    { id: "back-to-league-play", label: "Back to League Play", href: "/league-play", x: 1.4, y: 2.0, width: 14.2, height: 7.2 },
    { id: "matches-and-results", label: "Matches and Results", href: "/matches", x: 60.5, y: 2.0, width: 19.3, height: 7.4 },
    { id: "classic-standings", label: "Classic standings", href: "/match-standings", x: 80.8, y: 2.0, width: 18.0, height: 7.4 },
  ],
}

export const pypArtwork: ArtworkPageDefinition = {
  id: "pyp",
  title: "Krys Leagues Pick Your Poison",
  imageSrc: "/approved-pages/pyp-approved.jpg",
  imageAlt: "Krys Leagues Pick Your Poison with public standings, player profiles, and league records destinations",
  aspectRatio: "1142 / 1377",
  targets: [
    { id: "back-to-league-play", label: "Back to League Play", href: "/league-play", x: 2.6, y: 2.0, width: 16.6, height: 4.7 },
    { id: "public-standings", label: "View Public PYP Standings", href: "/pyp-standings", x: 1.3, y: 36.0, width: 31.8, height: 29.6 },
    { id: "player-profiles", label: "Explore Player Profiles", href: "/players", x: 34.1, y: 36.0, width: 31.8, height: 29.6 },
    { id: "league-records", label: "See PYP League Records", href: "/records", x: 66.9, y: 36.0, width: 31.8, height: 29.6 },
  ],
}

export const skinsArtwork: ArtworkPageDefinition = {
  id: "skins",
  title: "Krys Leagues Skins",
  imageSrc: "/approved-pages/skins-approved.jpg",
  imageAlt: "Krys Leagues Skins with leaderboard, results, player totals, and records destinations",
  aspectRatio: "1141 / 1378",
  targets: [
    { id: "back-to-league-play", label: "Back to League Play", href: "/league-play", x: 2.5, y: 2.0, width: 17.0, height: 4.8 },
    { id: "skins-leaderboard", label: "Open Skins Leaderboard", href: "/skins-standings", x: 1.5, y: 33.0, width: 48.0, height: 18.5 },
    { id: "player-totals", label: "Open Player Totals", href: "/players", x: 1.5, y: 52.2, width: 48.0, height: 18.0 },
    { id: "skins-records", label: "Open Skins Records", href: "/records", x: 50.8, y: 52.2, width: 48.0, height: 18.0 },
  ],
}

export const amateurToProArtwork: ArtworkPageDefinition = {
  id: "amateur-to-pro",
  title: "Krys Leagues Amateur to Pro",
  imageSrc: "/approved-pages/amateur-to-pro-approved.jpg",
  imageAlt: "Krys Leagues Amateur to Pro with matches, public standings, player progression, and league records destinations",
  aspectRatio: "1142 / 1378",
  targets: [
    { id: "back-to-league-play", label: "Back to League Play", href: "/league-play", x: 2.5, y: 1.6, width: 17.0, height: 5.0 },
    { id: "matches-and-results", label: "Open Amateur to Pro Matches and Results", href: "/matches", x: 1.5, y: 25.8, width: 34.7, height: 17.5 },
    { id: "public-standings", label: "Open Amateur to Pro Public Standings", href: "/amateur-pro-standings", x: 37.1, y: 25.8, width: 30.0, height: 17.5 },
    { id: "player-progression", label: "Open Player Progression", href: "/players", x: 68.0, y: 25.8, width: 30.5, height: 17.5 },
    { id: "league-records", label: "Open Amateur to Pro League Records", href: "/records", x: 1.5, y: 44.0, width: 41.5, height: 14.5 },
  ],
}

export const doublesArtwork: ArtworkPageDefinition = {
  id: "doubles",
  title: "Krys Leagues Doubles",
  imageSrc: "/approved-pages/doubles-approved.jpg",
  imageAlt: "Krys Leagues Doubles with matches and results, public standings, teams and players, and league records destinations",
  aspectRatio: "1700 / 2048",
  targets: [
    { id: "back-to-league-play", label: "Back to League Play", href: "/league-play", x: 1.8, y: 1.2, width: 17.0, height: 5.0 },
    { id: "matches-and-results", label: "Open Doubles Matches and Results", href: "/matches", x: 1.5, y: 21.5, width: 40.2, height: 14.2 },
    { id: "public-standings", label: "Open Doubles Public Standings", href: "/doubles-standings", x: 42.7, y: 21.5, width: 40.2, height: 14.2 },
    { id: "teams-and-players", label: "Open Doubles Teams and Players", href: "/players", x: 1.5, y: 35.8, width: 40.2, height: 14.4 },
    { id: "league-records", label: "Open Doubles League Records", href: "/records", x: 42.7, y: 35.8, width: 40.2, height: 14.4 },
  ],
}

export const strokeArtwork: ArtworkPageDefinition = {
  id: "stroke",
  title: "Krys Leagues Stroke Play",
  imageSrc: "/approved-pages/stroke-play-approved.jpg",
  imageAlt: "Krys Leagues Stroke Play with Matches and Results, Public Standings, League Records, and Player Profiles destinations",
  aspectRatio: "1696 / 2047",
  targets: [
    { id: "back-to-league-play", label: "Back to League Play", href: "/league-play", x: 2.0, y: 1.4, width: 20.0, height: 5.4 },
    { id: "matches-and-results", label: "Open Stroke Matches and Results", href: "/matches", x: 1.7, y: 21.6, width: 40.0, height: 13.8 },
    { id: "public-standings", label: "Open Stroke Public Standings", href: "/standings", x: 42.8, y: 21.6, width: 40.0, height: 13.8 },
    { id: "league-records", label: "Open Stroke League Records", href: "/records", x: 1.7, y: 36.5, width: 40.0, height: 13.8 },
    { id: "player-profiles", label: "Open Stroke Player Profiles", href: "/players", x: 42.8, y: 36.5, width: 40.0, height: 13.8 },
  ],
}

export const monthlyArtworkOverlayTargets: readonly ArtworkHitbox[] = [
  { id: "year", x: 7.0, y: 66.8, width: 27.5, height: 7.3 },
  { id: "month", x: 36.3, y: 66.8, width: 27.5, height: 7.3 },
  { id: "division", x: 65.6, y: 66.8, width: 27.5, height: 7.3 },
  { id: "previous-month", x: 2.5, y: 82.0, width: 25.3, height: 10.3 },
  { id: "next-month", x: 73.0, y: 82.0, width: 22.6, height: 10.3 },
]

export const monthlyArtwork: ArtworkPageDefinition = {
  id: "monthly-results",
  title: "Krys Leagues Monthly Results",
  imageSrc: "/approved-pages/monthly-results-approved.png",
  imageAlt: "Krys Leagues Monthly Results with Year, Month, Division, Previous Month, and Next Month controls",
  aspectRatio: "1641 / 959",
  targets: [
    { id: "back-to-krys-leagues", label: "Back to Krys Leagues", href: "/", x: 1.6, y: 2.6, width: 16.8, height: 8.0 },
  ],
}

export const overallLeaderboardsArtwork: ArtworkPageDefinition = {
  id: "overall-leaderboards",
  title: "Krys Leagues Overall Leaderboards",
  imageSrc: "/approved-pages/overall-leaderboards-approved.jpg",
  imageAlt: "Krys Leagues Overall Leaderboards with Single Course Records, Combined Records, and Speed Running Leaderboard",
  aspectRatio: "1698 / 2046",
  targets: [
    { id: "back-to-krys-leagues", label: "Back to Krys Leagues", href: "/", x: 3.0, y: 1.7, width: 16.1, height: 4.1 },
    { id: "single-course-records", label: "Single Course Records", href: "/records/single", x: 3.0, y: 21.8, width: 46.8, height: 23.2 },
    { id: "combined-records", label: "Combined Records", href: "/records/combined", x: 50.0, y: 21.8, width: 46.8, height: 23.2 },
  ],
}

export const playerProfilesArtwork: ArtworkPageDefinition = {
  id: "player-profiles",
  title: "Krys Leagues Player Profiles",
  imageSrc: "/approved-pages/player-profiles-approved.jpg",
  imageAlt: "Krys Leagues Global Players search page for public player profiles, stats, trophies, history, and achievements",
  aspectRatio: "2064 / 793",
  targets: [],
}

export const hallOfChampionsArtworkAsset = "/approved-pages/hall-of-champions-approved.jpg"
