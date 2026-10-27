import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const route = new URL("../../app/api/admin/kwt/trophy-manager/route.ts", import.meta.url)
const migration = new URL("../../supabase/migrations/20261026230000_kwt_trophy_manager_award_workflow.sql", import.meta.url)

test("Trophy Manager requires canonical player selection and links published awards", async () => {
  const source = await readFile(route, "utf8")
  assert.match(source, /canonicalPlayer\(/)
  assert.match(source, /player_trophies/) 
  assert.match(source, /kwt_award_id/)
  assert.match(source, /\/api\/trophies\/kwt-awards\//)
  assert.match(source, /attach_historical/)
  assert.match(source, /prepare_candidate/)
  assert.match(source, /created_for_candidate/)
  assert.match(source, /source_kind: "manual_review"/)
  assert.doesNotMatch(source, /source_kind: "admin_selected_player"/)
  assert.doesNotMatch(source, /form\.get\("previewName"\)/)
})

test("Trophy Manager UI keeps generated names in sync and exposes candidate preparation", async () => {
  const page = await readFile(new URL("../../app/admin/kwt/trophy-manager/page.tsx", import.meta.url), "utf8")
  assert.match(page, /generatedTemplateName/)
  assert.match(page, /Use generated name/)
  assert.match(page, /Prepare candidate for/)
  assert.match(page, /No award was approved or published/)
})

test("Trophy Manager migration is additive, idempotent, and keeps storage private", async () => {
  const source = await readFile(migration, "utf8")
  assert.match(source, /add column if not exists kwt_award_id/i)
  assert.match(source, /create unique index if not exists player_trophies_kwt_award_unique/i)
  assert.match(source, /select 'tournament-trophies'.*false/i)
  assert.match(source, /where not exists/i)
  assert.match(source, /award_scope in \('overall', 'division', 'historical'\)/i)
})
