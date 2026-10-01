export type MastersRuleSection = {
  title: string
  paragraphs: string[]
}

export const MASTERS_RULES_TITLE = "THE MINI-GOLF MASTERS"
export const MASTERS_RULES_SUBTITLE = "PLAYER RULES & INFORMATION"

export const MASTERS_OFFICIAL_RULES: MastersRuleSection[] = [
  { title: "BE READY ON TIME", paragraphs: ["Be in your room 5 minutes early.", "Rooms MUST START ON TIME."] },
  { title: "NO-SHOWS", paragraphs: ["Solo rounds are not allowed.", "If another Masters room is playing at your scheduled time, quickly join that room.", "If yours is the only room running, DO NOT START ALONE.", "Use CONTACT ADMIN immediately.", "The Masters admin team will decide how your round should be handled."] },
  { title: "SCORECARD PHOTOS", paragraphs: ["ALL PLAYERS must take a photo of the scorecard.", "This ensures there is a good backup card if another player's image is unclear or unusable.", "The DATE AND TIME MUST SHOW ON THE PHOTO."] },
  { title: "NO RESTARTS", paragraphs: ["NO RESTARTS.", "You may not restart the course because your round is not going as well as you hoped.", "Once your official round has begun, that is your round."] },
  { title: "OFFICIAL START TIME", paragraphs: ["The start time shown on the scorecard must be within 2 minutes of your room's official scheduled start time."] },
  { title: "ROOM SCORECARD", paragraphs: ["After play, ONE PLAYER from the room must upload the Room Scorecard into the Masters system.", "Once uploaded, the Room Scorecard is available to everyone in that room as a reference."] },
  { title: "ENTER YOUR OWN SCORE", paragraphs: ["EVERY PLAYER must enter THEIR OWN 18-hole score.", "Do not enter another player's score.", "ALL PLAYERS MUST ENTER THEIR OWN SCORES WITHIN 3 HOURS OF PLAY."] },
  { title: "DO NOT GIVE UP", paragraphs: ["If your round is not going as well as you would like, please do not give up.", "Ranking points are being earned for later tournaments, so every completed round matters."] },
  { title: "LIVE MASTERS SCORE TRACKER", paragraphs: ["A live Masters scoreboard will run throughout the event.", "Submitted scores may appear provisionally until an admin verifies them.", "Use VIEW LIVE MASTERS SCORE TRACKER in your Masters gateway."] },
  { title: "YOUR MASTERS GATEWAY", paragraphs: ["The Masters pop-up is the player's go-to for room, round, local play time, room roster, room instructions, official rules, score entry, live standings, and Contact Admin.", "You may close it with X.", "Use SHOW MASTERS ROOM to reopen it."] },
  { title: "NEED HELP?", paragraphs: ["Use CONTACT ADMIN in the Masters gateway.", "This immediately alerts the Masters admin team with your room, round, scheduled time, and reported issue."] },
  { title: "SPORTSMANSHIP", paragraphs: ["Be respectful.", "Follow the room instructions.", "Have fun."] },
]

export const MASTERS_HELP_CATEGORIES = [
  "PLAYER NO-SHOW",
  "CAN'T FIND MY ROOM",
  "SCORECARD PHOTO PROBLEM",
  "SCORE ENTRY PROBLEM",
  "WRONG ROOM OR TIME",
  "WEBSITE / TECHNICAL PROBLEM",
  "OTHER",
] as const

export type MastersHelpCategory = (typeof MASTERS_HELP_CATEGORIES)[number]

export function isMastersHelpCategory(value: unknown): value is MastersHelpCategory {
  return typeof value === "string" && MASTERS_HELP_CATEGORIES.includes(value as MastersHelpCategory)
}
