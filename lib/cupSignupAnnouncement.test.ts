import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  CUP_SIGNUP_ANNOUNCEMENT_VERSION,
  CUP_SIGNUP_ANNOUNCEMENT_ENABLED,
  CUP_SIGNUP_ARTWORK_SHA256,
  CUP_SIGNUP_DESTINATIONS,
  CUP_SIGNUP_DISCORD_INVITE_URL,
  CUP_SIGNUP_DISMISSAL_KEY,
  CUP_SIGNUP_INSTRUCTION,
  shouldRenderCupSignupAnnouncement,
} from "./cupSignupAnnouncement.ts"

test("Cup announcement is versioned and renders only on normal public/player pages", () => {
  assert.equal(CUP_SIGNUP_ANNOUNCEMENT_ENABLED, true)
  assert.equal(CUP_SIGNUP_ANNOUNCEMENT_VERSION, "cup-signups-2026-v2")
  assert.match(CUP_SIGNUP_DISMISSAL_KEY, /cup-signups-2026-v2/u)
  assert.equal(CUP_SIGNUP_INSTRUCTION, "CLICK THE CUP FOR YOUR DIVISION TO SIGN UP")

  for (const path of ["/", "/majors/masters", "/players/player-id", "/course-challenges", "/league-play"]) {
    assert.equal(shouldRenderCupSignupAnnouncement(path), true, path)
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

test("the Discord join fallback uses the exact static invite without changing the announcement version", () => {
  const component = readFileSync("components/announcements/CupSignupAnnouncement.tsx", "utf8")

  assert.equal(CUP_SIGNUP_ANNOUNCEMENT_VERSION, "cup-signups-2026-v2")
  assert.equal(CUP_SIGNUP_DISCORD_INVITE_URL, "https://discord.gg/FfaqUMx9N")
  assert.match(component, /Not in the Krys Leagues Discord yet\?/u)
  assert.match(component, /JOIN OUR DISCORD/u)
  assert.match(component, /href=\{CUP_SIGNUP_DISCORD_INVITE_URL\}/u)
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

test("the global client component is cheap, persistent, accessible, and coordinated with the sign-in modal", () => {
  const component = readFileSync("components/announcements/CupSignupAnnouncement.tsx", "utf8")
  const css = readFileSync("components/announcements/CupSignupAnnouncement.module.css", "utf8")
  const layout = readFileSync("app/layout.tsx", "utf8")
  const welcome = readFileSync("components/auth/OptionalSignInWelcome.tsx", "utf8")
  const adminAlerts = readFileSync("components/admin/AdminPendingAlerts.tsx", "utf8")

  assert.match(layout, /CUP_SIGNUP_ANNOUNCEMENT_ENABLED \? <CupSignupAnnouncement \/> : null/u)
  assert.match(component, /window\.localStorage\.getItem\(CUP_SIGNUP_DISMISSAL_KEY\)/u)
  assert.match(component, /window\.localStorage\.setItem\(CUP_SIGNUP_DISMISSAL_KEY, "dismissed"\)/u)
  assert.match(component, /🏆<\/span> CUP SIGNUPS/u)
  assert.match(component, /aria-modal="true"/u)
  assert.match(component, /Close Cup signup announcement/u)
  assert.match(component, /Escape/u)
  assert.match(component, /CUP_SIGNUP_DESTINATIONS\.map/u)
  assert.match(component, /aria-label=\{cup\.label\}/u)
  assert.match(component, /href=\{cup\.url\}/u)
  assert.match(component, /href=\{CUP_SIGNUP_DISCORD_INVITE_URL\}/u)
  assert.doesNotMatch(component, /target="_blank"|window\.open|preventDefault/u)
  assert.doesNotMatch(component, /supabase|fetch\(|setInterval|WebSocket|EventSource/u)
  assert.doesNotMatch(component, /tooltip|title=/u)
  assert.doesNotMatch(component, /mystery/iu)
  assert.match(welcome, /optionalSignInWelcome/u)
  assert.match(component, /data-optional-sign-in-welcome/u)

  assert.match(css, /\.launcherDock \{[\s\S]*top: max\(14px, env\(safe-area-inset-top\)\);[\s\S]*right: max\(14px, env\(safe-area-inset-right\)\);[\s\S]*z-index: 68;/u)
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.launcherDock \{[\s\S]*top: max\(10px, env\(safe-area-inset-top\)\);[\s\S]*right: max\(10px, env\(safe-area-inset-right\)\);/u)
  assert.doesNotMatch(css, /\.launcherDock \{[\s\S]*left:/u)
  assert.match(adminAlerts, /const mastersAlert:[\s\S]*zIndex: 71/u)
  assert.doesNotMatch(css, /\.launcherDock \{[\s\S]*bottom:/u)
  assert.match(css, /@media \(max-width: 700px\)/u)
  assert.match(css, /width: min\(1120px, 100%\)/u)
  assert.match(css, /width: min\(100%, 105dvh\)/u)
  assert.match(css, /width: 100%/u)
  assert.match(css, /height: auto/u)
  assert.match(css, /\.cupLink:hover,[\s\S]*\.cupLink:focus-visible/u)
  assert.match(css, /min-height: 46px/u)
  assert.doesNotMatch(css, /overflow-x/u)
})
