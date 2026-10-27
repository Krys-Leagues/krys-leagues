import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const builder = readFileSync(join(process.cwd(), "app/admin/tournament-builder/page.tsx"), "utf8")
const publicPage = readFileSync(join(process.cwd(), "app/tournaments/[slug]/page.tsx"), "utf8")
const adminRoute = readFileSync(join(process.cwd(), "app/api/admin/tournaments/route.ts"), "utf8")
const operations = readFileSync(join(process.cwd(), "app/api/admin/tournaments/[id]/route.ts"), "utf8")
const operationsPage = readFileSync(join(process.cwd(), "app/admin/tournament-builder/[id]/page.tsx"), "utf8")
const proposal = readFileSync(join(process.cwd(), "supabase/proposals/20261025_lynne_self_registration_and_bracket_seeding.proposed.sql"), "utf8")

test("builder creates an empty public-registration roster instead of loading Global Players", () => {
  assert.doesNotMatch(builder, /api\/admin\/players\?view=players/)
  assert.doesNotMatch(builder, /Confirmed canonical players/)
  assert.match(builder, /entrants: \[\]/)
  assert.match(builder, /useState\("draft"\)/)
  assert.match(builder, /confirmed self-registration list/i)
  assert.match(adminRoute, /\[0, size\]\.includes\(body\.entrants\.length\)/)
})

test("public signup displays confirmed canonical names and remaining capacity", () => {
  assert.match(publicPage, /tournament_registrations/)
  assert.match(publicPage, /REGISTERED PLAYERS/)
  assert.match(publicPage, /places remaining/)
  assert.match(publicPage, /screen_name/)
})

test("admin roster supports audited exceptions and seeds only confirmed registrations", () => {
  assert.match(operations, /admin_add_tournament_registration/)
  assert.match(operations, /admin_seed_tournament/)
  assert.match(operationsPage, /Manual player addition — protected exception/)
  assert.match(operationsPage, /SEED CONFIRMED REGISTRATIONS/)
  assert.match(proposal, /v_entrant_count := jsonb_array_length/)
  assert.match(proposal, /registration_mode.*public_self_registration/i)
  assert.match(proposal, /create or replace function public\.admin_add_tournament_registration/i)
  assert.match(proposal, /create or replace function public\.admin_seed_tournament/i)
  assert.match(proposal, /pg_advisory_xact_lock/)
})

