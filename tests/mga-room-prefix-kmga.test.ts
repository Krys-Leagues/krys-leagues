import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const sql = readFileSync(new URL("../supabase/migrations/20261111193000_mga_default_room_prefix_kmga.sql", import.meta.url), "utf8")
const page = readFileSync(new URL("../app/admin/mga/rooms/page.tsx", import.meta.url), "utf8")

test("new MGA rooms display and generate the KMGA prefix", () => {
  assert.match(page, /Create KMGA\{snapshot\.next_room_number\}/)
  assert.match(sql, /'KMGA'\s*\|\|\s*v_number::text/)
})

test("default prefix change preserves global sequential numbering and Admin overrides", () => {
  assert.match(sql, /next_room_number = next_room_number \+ 1/)
  assert.match(sql, /coalesce\(nullif\(btrim\(p_room_name\), ''\), 'KMGA' \|\| v_number::text\)/)
  assert.match(sql, /for update/)
})

test("migration defines only the create-room function and does not alter existing rooms or assignments", () => {
  assert.match(sql, /create or replace function mga_api\.create_room/)
  assert.doesNotMatch(sql, /\b(drop|delete|truncate)\s+(table|function|from|constraint)\b/i)
  assert.doesNotMatch(sql, /update\s+mga_regular\.(rooms|room_assignments|registration_slots)\b/i)
})
