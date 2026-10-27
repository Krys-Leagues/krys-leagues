export type GuidedTourStep = {
  id: string
  title: string
  description: string
  target: string
  path: string | ((canonicalPlayerId: string) => string)
  actionTarget?: string
}

export type GuidedTourDefinition = { id: string; label: string; steps: readonly GuidedTourStep[] }
const profilePath = (canonicalPlayerId: string) => `/players/${encodeURIComponent(canonicalPlayerId)}`

const fullSteps: readonly GuidedTourStep[] = [
  { id: "main-hub", title: "Start at the Main Hub", description: "The Main Hub is your map of Krys Leagues. The artwork buttons lead to the parts of the site you use most.", target: '[data-tour="main-hub"]', path: "/" },
  { id: "player-profiles", title: "Find a player", description: "Open Player Profiles to search for friends and view their public information.", target: '[data-tour="player-directory"]', path: "/players?browse=1" },
  { id: "player-search", title: "Search and open a profile", description: "Search by screen name, then choose a result to open that player’s public profile.", target: '[data-tour="player-search"]', path: "/players?browse=1" },
  { id: "my-profile", title: "Open MY PROFILE", description: "This small shortcut opens your own canonical profile. It is separate from browsing another player.", target: '[data-tour="my-profile-shortcut"]', path: (canonicalPlayerId) => profilePath(canonicalPlayerId) },
  { id: "handicap-tile", title: "Your HANDICAP", description: "The HANDICAP tile shows a published Handicap Index. It stays simple so the number is easy to find.", target: '[data-tour="handicap-tile"]', path: (canonicalPlayerId) => profilePath(canonicalPlayerId) },
  { id: "handicap-history", title: "Handicap History", description: "Open Handicap History for published status, qualifying-card details, effective dates, and real published changes.", target: '[data-tour="handicap-history"]', path: (canonicalPlayerId) => profilePath(canonicalPlayerId) },
  { id: "handicap-help", title: "What Is a Handicap?", description: "The help section explains the rolling-20 rules, Course Rating, Slope, qualifying cards, and gross versus net scores.", target: '[data-tour="handicap-help"]', path: (canonicalPlayerId) => profilePath(canonicalPlayerId) },
  { id: "leaderboards", title: "Explore Leaderboards", description: "Now we’ll open the real All-Time Leaderboards so you can see how the views change.", target: '[data-tour="leaderboards-page"]', path: "/records" },
  { id: "leaderboard-difficulty", title: "Easy, Hard, or Both", description: "Choose Easy, Hard, or Both. The boards refresh for the difficulty you selected.", target: '[data-tour="leaderboard-difficulty"]', actionTarget: '[data-tour="leaderboard-difficulty-easy"]', path: "/records" },
  { id: "leaderboard-types", title: "Different record views", description: "Stroke, Combined, and Race boards answer different questions. The available choices are the live options for this site.", target: '[data-tour="leaderboard-types"]', actionTarget: '[data-tour="leaderboard-type-combined"]', path: "/records" },
  { id: "leaderboard-course", title: "Choose a course", description: "The base-map selector changes which course catalog is compared. Try the controls yourself whenever you want.", target: '[data-tour="leaderboard-course"]', path: "/records" },
  { id: "leaderboard-player", title: "Open a player from a board", description: "Where a verified row is available, selecting a player opens the same public profile with Handicap and achievements.", target: '[data-tour="leaderboard-player-link"]', path: "/records" },
  { id: "course-challenges", title: "Course Challenges", description: "Course Challenges are available to every player, including players who have not joined a league.", target: '[data-tour="course-challenges-page"]', path: "/course-challenges" },
  { id: "course-select", title: "Choose an Achievement Book", description: "Select an available course book to see its real requirements and progress. This tutorial never submits a scorecard.", target: '[data-tour="course-select"]', actionTarget: '[data-tour="course-select"]', path: "/course-challenges" },
  { id: "course-book", title: "Levels and requirements", description: "The book shows Level 1–5 requirements, Easy and Hard sides, progress, rewards, and the Course Pro and Course Master areas.", target: '[data-tour="course-book"]', path: "/course-challenges" },
  { id: "course-levels", title: "Level 1–5", description: "Use the level rail to inspect the five course levels. Locked requirements stay protected until they unlock normally.", target: '[data-tour="course-levels"]', path: "/course-challenges" },
  { id: "course-rewards", title: "Rewards and progress", description: "The reward book shows earned and available stickers, Course Pro, Course Master, and the live progress for this player.", target: '[data-tour="course-rewards"]', path: "/course-challenges" },
  { id: "course-evidence", title: "Scorecard evidence", description: "When a challenge is ready, the live book explains the evidence submission path. This tour does not upload or submit anything.", target: '[data-tour="course-evidence"]', path: "/course-challenges" },
  { id: "league-play", title: "League play", description: "League pages contain schedules, results, and standings for competitions. You can explore them without joining a league.", target: '[data-tour="league-play-page"]', path: "/league-play" },
  { id: "join-leagues", title: "Joining leagues", description: "The Join area shows available league and tournament registration choices. The tour only explains the controls; it never registers you.", target: '[data-artwork-target-id="join-leagues"]', path: "/" },
  { id: "tournaments", title: "Tournaments", description: "Tournament pages show the live registration and results options that are currently available.", target: '[data-tour="tournaments-page"]', path: "/tournaments" },
  { id: "scorecards", title: "Scorecard submissions", description: "Scorecard submissions are verified before they can count. This is an explanation only; the tour never opens a submission form for a non-participant.", target: '[data-tour="scorecard-submissions"]', path: "/scorecards" },
  { id: "tour-help", title: "Restart the tour anytime", description: "Use the question-mark help button by MY PROFILE to restart the full tour or choose an area tour later.", target: '[data-tour="tour-help"]', path: "/" },
] as const

export const TOUR_DEFINITIONS: Readonly<Record<string, GuidedTourDefinition>> = {
  full: { id: "full", label: "Full site tour", steps: fullSteps },
  leaderboards: { id: "leaderboards", label: "Leaderboard tour", steps: fullSteps.filter((step) => ["leaderboards", "leaderboard-difficulty", "leaderboard-types", "leaderboard-course", "leaderboard-player"].includes(step.id)) },
  courseChallenges: { id: "courseChallenges", label: "Course Challenges tour", steps: fullSteps.filter((step) => ["course-challenges", "course-select", "course-book", "course-levels", "course-rewards", "course-evidence"].includes(step.id)) },
  profiles: { id: "profiles", label: "Player Profiles tour", steps: fullSteps.filter((step) => ["player-profiles", "player-search", "my-profile", "handicap-tile", "handicap-history", "handicap-help"].includes(step.id)) },
  handicap: { id: "handicap", label: "Handicap tour", steps: fullSteps.filter((step) => ["handicap-tile", "handicap-history", "handicap-help"].includes(step.id)) },
  leaguePlay: { id: "leaguePlay", label: "League play tour", steps: fullSteps.filter((step) => step.id === "league-play") },
  tournaments: { id: "tournaments", label: "Tournament tour", steps: fullSteps.filter((step) => step.id === "tournaments") },
}

export const GUIDED_TOUR_STEPS = TOUR_DEFINITIONS.full.steps
export type GuidedTourPreference = "started" | "completed" | "dismissed" | "skipped"

export function guidedTourStorageKey(canonicalPlayerId: string) { return `krys-leagues:guided-tour:v1:${canonicalPlayerId}` }
export function guidedTourStepPath(step: GuidedTourStep, canonicalPlayerId: string) { return typeof step.path === "function" ? step.path(canonicalPlayerId) : step.path }
export function isTourOfferSafePath(pathname: string) {
  return !["/admin", "/auth", "/api", "/join", "/register", "/scorecards", "/majors/live", "/majors/masters-stream", "/doubles/scorecard", "/solo/submit", "/course-challenges/"].some((prefix) => pathname === prefix || pathname.startsWith(prefix))
}
export function shouldHidePlayerTools(pathname: string) { return !isTourOfferSafePath(pathname) }
