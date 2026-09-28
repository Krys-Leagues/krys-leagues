import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migrationPath = "supabase/migrations/20260928130000_masters_waitlist.sql"
const publicPagePath = "app/majors/[slug]/page.tsx"
const adminPagePath = "app/admin/majors/waitlist/page.tsx"

test("Masters wait list schema is canonical, additive, and capacity-neutral", async () => {
  const sql = await readFile(migrationPath, "utf8")
  assert.match(sql, /create table if not exists public\.major_waitlist_entries/u)
  assert.match(sql, /player_id uuid not null references public\.players\(id\)/u)
  assert.match(sql, /create unique index if not exists major_waitlist_active_player_idx[\s\S]*where state = 'waiting'/u)
  assert.match(sql, /create table if not exists public\.major_waitlist_day_choices/u)
  const joinFunction = sql.match(/create or replace function public\.join_major_waitlist_with_slots[\s\S]*?create or replace function public\.get_major_waitlist\(/u)?.[0] || ""
  assert.notEqual(joinFunction, "")
  assert.doesNotMatch(joinFunction, /insert into public\.major_entries/u)
  assert.match(sql, /grant execute on function public\.join_major_waitlist_with_slots/u)
})

test("wait-list join validates full capacity and saves preferences without confirmed rows", async () => {
  const sql = await readFile(migrationPath, "utf8")
  assert.match(sql, /claimed_count < signup_event\.signup_capacity/u)
  assert.match(sql, /The released Masters field is not full/u)
  assert.match(sql, /insert into public\.major_waitlist_day_choices/u)
  assert.match(sql, /Your saved time for Day|Choose one available time for Day/u)
  assert.match(sql, /join_major_waitlist_with_slots/u)
})

test("promotion is an atomic admin-only revalidation into normal Major records", async () => {
  const sql = await readFile(migrationPath, "utf8")
  assert.match(sql, /if not public\.is_current_user_site_admin\(\)/u)
  assert.match(sql, /for update/u)
  assert.match(sql, /slot\.is_available/u)
  assert.match(sql, /A saved time for Day % is no longer available/u)
  assert.match(sql, /Only the next waiting player may be promoted/u)
  assert.match(sql, /insert into public\.major_entries/u)
  assert.match(sql, /insert into public\.major_entry_day_choices/u)
  assert.match(sql, /state = 'promoted'/u)
})

test("public and admin Masters surfaces expose the wait-list flow", async () => {
  const [publicPage, adminPage] = await Promise.all([
    readFile(publicPagePath, "utf8"),
    readFile(adminPagePath, "utf8"),
  ])
  assert.match(publicPage, /join_major_waitlist_with_slots/u)
  assert.match(publicPage, /JOIN WAIT LIST/u)
  assert.match(publicPage, /position/u)
  assert.match(adminPage, /get_major_waitlist/u)
  assert.match(adminPage, /promote_major_waitlist_entry/u)
  assert.match(adminPage, /remove_major_waitlist_entry/u)
})
