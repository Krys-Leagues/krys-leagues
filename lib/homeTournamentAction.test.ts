import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { getHomeTournamentAction, isVerifiedOpenRegistration } from "./homeTournamentAction.ts"

const NOW = Date.parse("2026-10-18T12:00:00.000Z")

test("open registration keeps the original signup action and destination", () => {
  assert.deepEqual(getHomeTournamentAction("/register", true), {
    label: "LIVE TOURNEY SIGN-UPS",
    href: "/register",
    kind: "registration",
  })
})

test("only a recent, explicit open registration is verified", () => {
  assert.equal(isVerifiedOpenRegistration({ active: true, registration_open: true, registration_url: "/register", updated_at: "2026-10-17T12:00:00.000Z" }, NOW), true)
  assert.equal(isVerifiedOpenRegistration({ active: true, registration_open: true, registration_url: "/register", updated_at: "2026-09-07T12:00:00.000Z" }, NOW), false)
  assert.equal(isVerifiedOpenRegistration(undefined, NOW), false)
})

test("closed registration falls back to Masters final results", () => {
  assert.deepEqual(getHomeTournamentAction(null, true), {
    label: "THE MGA OPEN — COMING SOON",
    href: "/majors/masters/results",
    kind: "masters-results",
  })
})

test("there is no tournament action while registration is closed and Masters is incomplete", () => {
  assert.equal(getHomeTournamentAction(null, false), null)
})

test("the home hub mounts one shared featured tournament banner", () => {
  const home = readFileSync("app/page.tsx", "utf8")
  assert.match(home, /artwork-navigation__masters-link/u)
  assert.match(home, /THE MGA OPEN/u)
  assert.match(home, /COMING SOON/u)
  assert.match(home, /disabled/u)
  assert.doesNotMatch(home, /CupSignupAnnouncement/u)
  assert.doesNotMatch(home, /href="\/majors\/masters\/results"/u)
  assert.doesNotMatch(home, /MastersLiveAnnouncement/u)
  assert.doesNotMatch(home, /hub-utility-stack/u)
})
