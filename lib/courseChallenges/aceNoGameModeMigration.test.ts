import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")
const migration = read("supabase/migrations/20260921145230_course_challenges_ace_no_game_mode_rpc_fix.sql")

test("Ace RPC migration is narrow and matches the reviewed corrected function", () => {
  const reviewed = read("course_challenges_admin_review_hotfix.sql")
  const migrationFunction = migration.match(/create or replace function public\.approve_course_challenge_submission\([\s\S]*?\$function\$;/i)?.[0]
  const reviewedFunction = reviewed.match(/create or replace function public\.approve_course_challenge_submission\([\s\S]*?\$function\$;/i)?.[0]

  assert.ok(migrationFunction, "migration must define the approval RPC")
  assert.ok(reviewedFunction, "reviewed hotfix must define the approval RPC")
  assert.equal(migration.trim(), migrationFunction.trim(), "migration must contain only the replacement function")
  assert.equal(migrationFunction.trim(), reviewedFunction.trim(), "migration must match the reviewed corrected function")
  assert.equal((migration.match(/create or replace function/gi) ?? []).length, 1)
  assert.doesNotMatch(migration, /drop function|alter table|create table|grant |revoke /i)
})

test("Ace approval explicitly ignores game mode while preserving non-Ace multiplayer rules", () => {
  assert.match(migration, /create or replace function public\.approve_course_challenge_submission/i)
  assert.match(migration, /security definer/i)
  assert.match(migration, /set search_path to ''/i)
  assert.match(migration, /if v_submission\.challenge_key = 'ace' then[\s\S]*?v_mode := null;/i)
  assert.doesNotMatch(migration, /v_submission\.challenge_key = 'ace' or v_submission\.level_number >= 3/i)
  assert.doesNotMatch(migration, /Levels 3–5 and the Ace Challenge require verified Multiplayer Game Mode/i)
  assert.match(migration, /elsif v_submission\.challenge_key = 'prestige' or v_submission\.level_number >= 3 then[\s\S]*?v_mode <> 'multiplayer'/i)
  assert.match(migration, /if v_submission\.challenge_key <> 'ace' and v_mode = 'multiplayer' then/i)
  assert.match(migration, /admin_verified_game_mode = case when v_submission\.challenge_key = 'ace' then v_submission\.admin_verified_game_mode else v_mode end/i)
  assert.match(migration, /'game_mode', case when v_submission\.challenge_key = 'ace' then null else v_mode end/i)
})
