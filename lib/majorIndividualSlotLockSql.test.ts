import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync(new URL("../supabase/migrations/20261029170000_major_individual_slot_moveout_locks.sql", import.meta.url), "utf8")

test("staging lock migration enforces per-slot move-out and started-slot boundaries", () => {
  assert.match(migration, /old_starts_at - interval '12 hours'/)
  assert.match(migration, /new_starts_at <= now\(\)/)
  assert.match(migration, /major_entry_day_choice_audit/)
  assert.match(migration, /reason text not null/)
  assert.match(migration, /Administrator scheduling override via admin_set_major_day_choice/)
  assert.match(migration, /is_current_user_site_admin\(\)/)
  assert.match(migration, /from auth\.identities i/)
  assert.doesNotMatch(migration, /user_metadata.*provider_id/i)
  assert.match(migration, /alter table public\.major_entry_day_choice_audit enable row level security/)
  assert.match(migration, /if not exists \([\s\S]*?select 1\s*from pg_policy/)
  assert.doesNotMatch(migration, /force row level security/i)
  assert.doesNotMatch(migration, /drop policy|drop trigger/i)
  assert.doesNotMatch(migration, /selection_locks_at\)\s*then raise exception/i)
  assert.doesNotMatch(migration, /drop trigger|delete from|truncate table/i)
})

test("repeat signup remains unique and transactional", () => {
  assert.match(migration, /on conflict\(major_event_id, player_id\) do update/i)
  assert.match(migration, /on conflict\(entry_id, play_day_id\) do update/i)
  assert.match(migration, /for update;/i)
  assert.match(migration, /returns public\.major_entries/i)
})
