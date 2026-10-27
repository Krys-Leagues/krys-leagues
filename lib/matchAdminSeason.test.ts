import assert from "node:assert/strict"
import test from "node:test"
import {
  resolveCurrentMatchAdminSeason,
  type MatchAdminRoster,
  type MatchAdminSeason,
} from "./matchAdminSeason.ts"

const managedCurrent: MatchAdminSeason = {
  id: "managed-current",
  season_number: 59,
  is_active: true,
  is_locked: false,
  start_date: null,
  end_date: null,
}

const legacyCurrent: MatchAdminSeason = {
  id: "legacy-current",
  season_number: 58,
  is_active: true,
  is_locked: false,
  start_date: "2026-09-01",
  end_date: "2026-10-31",
}

const historical: MatchAdminSeason = {
  id: "historical",
  season_number: 57,
  is_active: false,
  is_locked: false,
  start_date: "2026-08-01",
  end_date: "2026-09-30",
}

const managedRoster: MatchAdminRoster = {
  season_id: managedCurrent.id,
  status: "approved",
}

test("resolves the current managed Match season first", () => {
  const result = resolveCurrentMatchAdminSeason(
    [legacyCurrent, managedCurrent],
    [managedRoster],
    null,
    new Date("2026-10-07T12:00:00Z")
  )

  assert.equal(result?.season.id, managedCurrent.id)
  assert.equal(result?.source, "managed")
})

test("uses an active unlocked legacy season only as a fallback", () => {
  const result = resolveCurrentMatchAdminSeason(
    [legacyCurrent],
    [],
    null,
    new Date("2026-10-07T12:00:00Z")
  )

  assert.equal(result?.season.id, legacyCurrent.id)
  assert.equal(result?.source, "legacy-fallback")
})

test("does not select inactive or ended history as a fallback", () => {
  const endedActive: MatchAdminSeason = {
    ...legacyCurrent,
    id: "ended-active",
    end_date: "2026-09-30",
  }

  const result = resolveCurrentMatchAdminSeason(
    [historical, endedActive],
    [],
    null,
    new Date("2026-10-07T12:00:00Z")
  )

  assert.equal(result, null)
})

test("does not select a future-dated active season as a fallback", () => {
  const future: MatchAdminSeason = {
    ...legacyCurrent,
    id: "future-active",
    start_date: "2026-11-01",
  }

  const result = resolveCurrentMatchAdminSeason(
    [future],
    [],
    null,
    new Date("2026-10-07T12:00:00Z")
  )

  assert.equal(result, null)
})

test("keeps an explicitly requested managed season addressable", () => {
  const locked: MatchAdminSeason = {
    ...managedCurrent,
    id: "managed-locked",
    is_active: false,
    is_locked: true,
  }

  const result = resolveCurrentMatchAdminSeason(
    [managedCurrent, locked],
    [managedRoster, { season_id: locked.id, status: "locked" }],
    locked.id,
    new Date("2026-10-07T12:00:00Z")
  )

  assert.equal(result?.season.id, locked.id)
  assert.equal(result?.source, "managed")
})

test("does not treat a locked managed season as current", () => {
  const locked: MatchAdminSeason = {
    ...managedCurrent,
    is_active: false,
    is_locked: true,
  }

  const result = resolveCurrentMatchAdminSeason(
    [locked],
    [{ season_id: locked.id, status: "locked" }],
    null,
    new Date("2026-10-07T12:00:00Z")
  )

  assert.equal(result, null)
})
