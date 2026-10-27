import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"
import { getPublicRegistrationArtworkState } from "../../lib/tournaments/registrationPresentation.ts"
import type { PublicOpenTournament } from "../../lib/tournaments/public.ts"

const read = (path: string) => readFileSync(path, "utf8")

test("Bracket Tournaments uses the approved artwork and canonical public route wiring", () => {
  const page = read("app/tournaments/page.tsx")
  const map = read("lib/artworkPageMaps.ts")

  assert.match(page, /bracketTournamentsArtwork/)
  assert.match(page, /BracketRegistrationOverlay/)
  assert.match(page, /bracket-tournaments-registration-open-approved\.png/)
  assert.match(page, /bracket-tournaments-registration-closed-approved\.png/)
  assert.match(page, /getPublicRegistrationArtworkState/)
  assert.match(page, /overview\.open\.length === 0/)
  assert.match(map, /bracket-tournaments-registration-open-approved\.png/)
  assert.match(map, /id: "open-registration"/)
  assert.ok(existsSync("public/approved-pages/bracket-tournaments-clean-approved.png"))
  assert.ok(existsSync("public/approved-pages/bracket-tournaments-registration-open-approved.png"))
  assert.ok(existsSync("public/approved-pages/bracket-tournaments-registration-closed-approved.png"))
  assert.ok(existsSync("public/approved-pages/bracket-tournaments-approved.png"))
  assert.match(map, /href: "\/"/)
  assert.match(map, /href: "\/majors\?from=tournaments"/)
  assert.match(map, /href: "\/tournaments\/current"/)
  assert.match(map, /href: "\/tournaments\/current#live-preview"/)
  assert.match(map, /href: "\/tournaments\/history"/)
  assert.match(map, /href: "\/invitationals"/)
  assert.doesNotMatch(page, /1545049848204496896|discord\.com\/channels\//)
})

test("registration artwork is selected by Builder state and open details remain functional", () => {
  const overlay = read("app/tournaments/BracketRegistrationOverlay.tsx")
  const page = read("app/tournaments/page.tsx")
  const cards = read("app/tournaments/InternalTournamentCards.tsx")

  assert.match(overlay, /PublicLiveTournament/)
  assert.match(overlay, /LIVE BRACKET PREVIEW/)
  assert.match(overlay, /live\.length > 0 \? <div style=\{livePanel\}/)
  assert.doesNotMatch(overlay, /NO OPEN REGISTRATION|Open registration|confirmed_count|registrationRegion|registrationItem/)
  assert.match(page, /InternalTournamentCards/)
  assert.match(cards, /tournament\.confirmed_count/)
  assert.match(cards, /href={`\/tournaments\/\$\{tournament\.slug\}`}/)
  assert.match(page, /open-registration/)
  assert.match(overlay, /pointerEvents: "none"/)
  assert.doesNotMatch(overlay, /1545049848204496896/)
})

test("public registration artwork state selects closed, open, and multiple-open states", () => {
  const makeTournament = (id: string): PublicOpenTournament => ({
    id,
    name: `Tournament ${id}`,
    slug: `tournament-${id}`,
    bracket_size: 32,
    registration_capacity: 32,
    confirmed_count: 3,
    registration_open_at: null,
    has_artwork: false,
    has_rules: false,
  })

  assert.equal(getPublicRegistrationArtworkState([]), "closed")
  assert.equal(getPublicRegistrationArtworkState([makeTournament("one")]), "open")
  assert.equal(getPublicRegistrationArtworkState([makeTournament("one"), makeTournament("two")]), "open")
})

test("Current Brackets uses the Builder projection and only renders published live brackets", () => {
  const page = read("app/tournaments/current/page.tsx")
  const projection = read("lib/tournaments/public.ts")
  const projectionRules = read("lib/tournaments/publicProjection.ts")
  const preview = read("app/tournaments/current/LiveBracketPreview.tsx")

  assert.match(page, /loadPublicTournamentOverview/)
  assert.match(page, /force-dynamic/)
  assert.match(page, /id="live-preview"/)
  assert.match(projection, /trustedTournamentClient/)
  assert.match(projection, /isPublishedBracket/)
  assert.match(projectionRules, /matchCount === bracketSize - 1/)
  assert.doesNotMatch(projection, /player_id.*json|discord|player_timezone/i)
  assert.match(preview, /role="tablist"/)
  assert.match(preview, /Open full bracket and Match Center/)
  assert.doesNotMatch(preview, /fetch\(/)
})

test("Tournament history uses only completed Builder tournaments and keeps Hall separate", () => {
  const page = read("app/tournaments/history/page.tsx")

  assert.match(page, /loadPublicTournamentOverview/)
  assert.match(page, /overview\.completed/)
  assert.match(page, /\/tournaments/)
  assert.match(page, /\/champions\?category=bracket&amp;from=tournaments/)
  assert.match(page, /View completed bracket/)
  assert.doesNotMatch(page, /insert|upsert/i)
})

test("Majors and Hall preserve deterministic local return paths", () => {
  const majors = read("app/majors/page.tsx")
  const hall = read("app/champions/page.tsx")

  assert.match(majors, /useSearchParams/)
  assert.match(majors, /backHref = searchParams\.get\("from"\)/)
  assert.match(majors, /"\/tournaments" : "\/"/)
  assert.match(hall, /from === "tournaments"/)
  assert.match(hall, /"\/tournaments"/)
})

test("Invitationals keeps Earn Your Invite on the Bracket route", () => {
  const map = read("lib/artworkPageMaps.ts")
  assert.match(map, /id: "invitationals"/)
  assert.match(map, /id: "earn-your-invite"[\s\S]*?href: "\/tournaments"/)
})
