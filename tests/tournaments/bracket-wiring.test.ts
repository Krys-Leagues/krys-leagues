import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(path, "utf8")

test("Bracket Tournaments uses the approved artwork and canonical public route wiring", () => {
  const page = read("app/tournaments/page.tsx")
  const map = read("lib/artworkPageMaps.ts")

  assert.match(page, /bracketTournamentsArtwork/)
  assert.match(page, /BracketRegistrationOverlay/)
  assert.match(map, /bracket-tournaments-approved\.png/)
  assert.match(map, /href: "\/"/)
  assert.match(map, /href: "\/majors\?from=tournaments"/)
  assert.match(map, /href: "\/tournaments\/current"/)
  assert.match(map, /href: "\/tournaments\/current#live-preview"/)
  assert.match(map, /href: "\/tournaments\/history"/)
  assert.match(map, /href: "\/invitationals"/)
  assert.doesNotMatch(page, /1545049848204496896|discord\.com\/channels\//)
})

test("public registration is safe, optional, and uses the active saved record", () => {
  const overlay = read("app/tournaments/BracketRegistrationOverlay.tsx")

  assert.match(overlay, /registration_open/)
  assert.match(overlay, /eq\("active", true\)/)
  assert.match(overlay, /target="_blank"/)
  assert.match(overlay, /rel="noopener noreferrer"/)
  assert.match(overlay, /pointerEvents: "none"/)
  assert.match(overlay, /pointerEvents: "auto"/)
  assert.doesNotMatch(overlay, /1545049848204496896/)
})

test("Current Brackets has verified tournaments and server-only preview loading", () => {
  const page = read("app/tournaments/current/page.tsx")
  const adapter = read("lib/tourneyBot.ts")
  const preview = read("app/tournaments/current/LiveBracketPreview.tsx")

  assert.match(page, /CURRENT_TOURNAMENTS/)
  assert.match(page, /force-dynamic/)
  assert.match(page, /id="live-preview"/)
  assert.match(adapter, /71394/)
  assert.match(adapter, /72111/)
  assert.match(adapter, /tourneybot\.gg\/tourneys\/71394/)
  assert.match(adapter, /tourneybot\.gg\/tourneys\/72111/)
  assert.match(adapter, /revalidate: 60/)
  assert.match(adapter, /__NEXT_DATA__/)
  assert.doesNotMatch(adapter, /supabase|\.insert\(|\.upsert\(/i)
  assert.match(preview, /role="tablist"/)
  assert.match(preview, /View Full Bracket/)
  assert.doesNotMatch(preview, /fetch\(/)
})

test("Tournament history uses only the verified OG Challenge Cup and keeps Hall separate", () => {
  const page = read("app/tournaments/history/page.tsx")
  const adapter = read("lib/tourneyBot.ts")

  assert.match(page, /ARCHIVED_TOURNAMENTS/)
  assert.match(adapter, /71112/)
  assert.match(page, /\/tournaments/)
  assert.match(page, /\/champions\?category=bracket&amp;from=tournaments/)
  assert.match(adapter, /tourneybot\.gg\/tourneys\/71112/)
  assert.match(page, /View Full Bracket/)
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