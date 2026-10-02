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
  discordChannelUrl,
  shouldRenderCupSignupAnnouncement,
} from "./cupSignupAnnouncement.ts"

test("Cup announcement is versioned and renders only on normal public/player pages", () => {
  assert.equal(CUP_SIGNUP_ANNOUNCEMENT_ENABLED, false)
  assert.equal(CUP_SIGNUP_ANNOUNCEMENT_VERSION, "cup-signups-2026-v1")
  assert.match(CUP_SIGNUP_DISMISSAL_KEY, /cup-signups-2026-v1/u)
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
  assert.deepEqual(
    CUP_SIGNUP_DESTINATIONS.map(({ label, channelId }) => ({ label, channelId, url: discordChannelUrl(channelId) })),
    [
      {
        label: "SIGN UP FOR THE RYDERVALE CUP",
        channelId: "1554740606905884713",
        url: "https://discord.com/channels/1036296151651074168/1554740606905884713",
      },
      {
        label: "SIGN UP FOR THE TIARA CUP",
        channelId: "1554740768478855221",
        url: "https://discord.com/channels/1036296151651074168/1554740768478855221",
      },
      {
        label: "SIGN UP FOR THE NEXT GEN CUP",
        channelId: "1554740930484117554",
        url: "https://discord.com/channels/1036296151651074168/1554740930484117554",
      },
    ],
  )
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

  assert.match(layout, /CUP_SIGNUP_ANNOUNCEMENT_ENABLED \? <CupSignupAnnouncement \/> : null/u)
  assert.match(component, /window\.localStorage\.getItem\(CUP_SIGNUP_DISMISSAL_KEY\)/u)
  assert.match(component, /window\.localStorage\.setItem\(CUP_SIGNUP_DISMISSAL_KEY, "dismissed"\)/u)
  assert.match(component, /🏆<\/span> CUP SIGNUPS/u)
  assert.match(component, /aria-modal="true"/u)
  assert.match(component, /Close Cup signup announcement/u)
  assert.match(component, /Escape/u)
  assert.match(component, /CUP_SIGNUP_DESTINATIONS\.map/u)
  assert.match(component, /aria-label=\{cup\.label\}/u)
  assert.match(component, /target="_blank"/u)
  assert.doesNotMatch(component, /supabase|fetch\(|setInterval|WebSocket|EventSource/u)
  assert.doesNotMatch(component, /tooltip|title=/u)
  assert.doesNotMatch(component, /mystery/iu)
  assert.match(welcome, /optionalSignInWelcome/u)
  assert.match(component, /data-optional-sign-in-welcome/u)

  assert.match(css, /left: 50%/u)
  assert.match(css, /transform: translateX\(-50%\)/u)
  assert.match(css, /@media \(max-width: 700px\)/u)
  assert.match(css, /width: min\(1120px, 100%\)/u)
  assert.match(css, /width: min\(100%, 105dvh\)/u)
  assert.match(css, /width: 100%/u)
  assert.match(css, /height: auto/u)
  assert.match(css, /\.cupLink:hover,[\s\S]*\.cupLink:focus-visible/u)
  assert.match(css, /min-height: 46px/u)
  assert.doesNotMatch(css, /overflow-x/u)
})
