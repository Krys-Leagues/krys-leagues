import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  CUP_SIGNUP_ANNOUNCEMENT_VERSION,
  CUP_SIGNUP_ANNOUNCEMENT_ENABLED,
  CUP_SIGNUP_ARTWORK_SHA256,
  CUP_SIGNUP_DESTINATIONS,
  CUP_SIGNUP_DISMISSAL_KEY,
  CUP_SIGNUP_INSTRUCTION,
  shouldRenderCupSignupAnnouncement,
} from "./cupSignupAnnouncement.ts"

test("Cup announcement is versioned and scoped to the Players Hub", () => {
  assert.equal(CUP_SIGNUP_ANNOUNCEMENT_ENABLED, true)
  assert.equal(CUP_SIGNUP_ANNOUNCEMENT_VERSION, "cup-signups-2026-v2")
  assert.match(CUP_SIGNUP_DISMISSAL_KEY, /cup-signups-2026-v2/u)
  assert.equal(CUP_SIGNUP_INSTRUCTION, "CLICK THE CUP FOR YOUR DIVISION TO SIGN UP")

  assert.equal(shouldRenderCupSignupAnnouncement("/"), true)
  for (const path of ["/majors/masters", "/players/player-id", "/course-challenges", "/league-play"]) {
    assert.equal(shouldRenderCupSignupAnnouncement(path), false, path)
  }
  for (const path of ["/admin", "/admin/majors", "/auth/callback", "/testing-access", "/access-denied", "/majors/masters-stream/card-id"]) {
    assert.equal(shouldRenderCupSignupAnnouncement(path), false, path)
  }
  assert.equal(shouldRenderCupSignupAnnouncement(null), false)
})

test("the three accessible cup regions route to the configured Krys Leagues Discord channels", () => {
  const configuration = readFileSync("lib/cupSignupAnnouncement.ts", "utf8")

  assert.deepEqual(
    CUP_SIGNUP_DESTINATIONS.map(({ label, url }) => ({ label, url })),
    [
      {
        label: "SIGN UP FOR THE RYDERVALE CUP",
        url: "https://discord.com/channels/1036296151651074168/1554740606905884713",
      },
      {
        label: "SIGN UP FOR THE TIARA CUP",
        url: "https://discord.com/channels/1036296151651074168/1554740768478855221",
      },
      {
        label: "SIGN UP FOR THE NEXT GEN CUP",
        url: "https://discord.com/channels/1036296151651074168/1554740930484117554",
      },
    ],
  )
  assert.doesNotMatch(configuration, /KRYS_LEAGUES_DISCORD_GUILD_ID|discordChannelUrl|channelId/u)
})

test("the featured banner reads open registration from the authoritative source", () => {
  const component = readFileSync("components/announcements/CupSignupAnnouncement.tsx", "utf8")
  assert.match(component, /LIVE TOURNEY SIGN-UPS/u)
  assert.match(component, /bracket_public_content/u)
  assert.match(component, /registration_open/u)
  assert.match(component, /registration_url/u)
  assert.match(component, /updated_at/u)
  assert.match(component, /isVerifiedOpenRegistration/u)
  assert.match(component, /getHomeTournamentAction/u)
  assert.match(component, /artwork-navigation__masters-link/u)
  assert.match(component, /artwork-navigation__masters-jacket/u)
  assert.match(component, /artwork-navigation__masters-copy/u)
  const action = readFileSync("lib/homeTournamentAction.ts", "utf8")
  assert.match(action, /THE MGA OPEN — COMING SOON/u)
})

test("the featured banner has no detached signup or modal controls", () => {
  const component = readFileSync("components/announcements/CupSignupAnnouncement.tsx", "utf8")

  assert.equal(CUP_SIGNUP_ANNOUNCEMENT_VERSION, "cup-signups-2026-v2")
  assert.doesNotMatch(component, /CUP_SIGNUP_DISCORD_INVITE_URL/u)
  assert.doesNotMatch(component, /launcherDock|aria-modal|Close Cup signup announcement|setDisplay|localStorage/u)
  assert.doesNotMatch(component, /<button/u)
})

test("responsive percentage hit regions are generous, non-overlapping, and stop before the inert artwork area", () => {
  assert.equal(CUP_SIGNUP_DESTINATIONS.length, 3)
  const regions = CUP_SIGNUP_DESTINATIONS.map((cup) => cup.area).sort((left, right) => left.left - right.left)
  for (const region of regions) {
    assert.ok(region.width >= 20)
    assert.ok(region.height >= 80)
    assert.ok(region.left >= 0 && region.top >= 0)
    assert.ok(region.left + region.width <= 73)
    assert.ok(region.top + region.height <= 100)
  }
  for (let index = 1; index < regions.length; index += 1) {
    assert.ok(regions[index - 1].left + regions[index - 1].width <= regions[index].left)
  }
})

test("the approved artwork bytes are unchanged", () => {
  const artwork = readFileSync("public/images/announcements/cup-signups-2026-v1.jpg")
  const checksum = createHash("sha256").update(artwork).digest("hex")
  assert.equal(checksum, CUP_SIGNUP_ARTWORK_SHA256)
  assert.equal(artwork.byteLength, 290254)
})

test("the global client component is scoped, dynamic, and reuses the approved Masters banner", () => {
  const component = readFileSync("components/announcements/CupSignupAnnouncement.tsx", "utf8")
  const layout = readFileSync("app/layout.tsx", "utf8")
  const home = readFileSync("app/page.tsx", "utf8")
  const adminAlerts = readFileSync("components/admin/AdminPendingAlerts.tsx", "utf8")

  assert.equal((home.match(/<CupSignupAnnouncement \/>/gu) || []).length, 1)
  assert.doesNotMatch(layout, /CupSignupAnnouncement/u)
  assert.doesNotMatch(home, /artwork-navigation__next-major-state/u)
  assert.match(component, /bracket_public_content/u)
  assert.match(component, /href=\{action\.href\}/u)
  assert.match(component, /supabase/u)
  assert.match(component, /\.from\("bracket_public_content"\)/u)
  assert.match(component, /\.from\("major_events"\)/u)
  assert.match(component, /isMajorCompleted/u)
  assert.match(component, /artwork-navigation__masters-link/u)
  assert.doesNotMatch(component, /position: fixed|right:|bottom:/u)
  assert.match(adminAlerts, /const mastersAlert:[\s\S]*zIndex: 71/u)
})
