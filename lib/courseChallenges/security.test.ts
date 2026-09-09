import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function readFoundation() {
  return readFile(new URL("../../course_challenges_foundation.sql", import.meta.url), "utf8")
}

test("Course Challenge player ownership uses the canonical current-player resolver", async () => {
  const sql = await readFoundation()
  const tablePolicySection = sql.slice(sql.indexOf("drop policy if exists course_challenge_progress_public_read"), sql.indexOf("insert into storage.buckets"))

  assert.match(sql, /references public\.players\(id\)/g)
  assert.match(tablePolicySection, /public\.current_user_canonical_player_id\(\)/)
  assert.doesNotMatch(tablePolicySection, /auth\.uid\(\)\s*=\s*player_id|player_id\s*=\s*auth\.uid\(\)/)
})

test("Course Challenge progress and rewards remain read-only public collection data", async () => {
  const sql = await readFoundation()
  const policySection = sql.slice(sql.indexOf("drop policy if exists course_challenge_progress_public_read"))
  const progressPolicy = policySection.slice(0, policySection.indexOf("drop policy if exists course_challenge_rewards_public_read"))
  const rewardsPolicy = policySection.slice(policySection.indexOf("drop policy if exists course_challenge_rewards_public_read"), policySection.indexOf("drop policy if exists course_challenge_submissions_own_read"))

  assert.match(sql, /course_challenge_progress_public_read[\s\S]*for select to anon, authenticated using \(true\)/)
  assert.match(sql, /course_challenge_rewards_public_read[\s\S]*for select to anon, authenticated using \(true\)/)
  assert.doesNotMatch(progressPolicy, /for (?:insert|update|delete|all)/i)
  assert.doesNotMatch(rewardsPolicy, /for (?:insert|update|delete|all)/i)
})

test("Course Challenge submissions and profile selections are canonical-player and admin bound", async () => {
  const sql = await readFoundation()

  assert.match(sql, /course_challenge_submissions_own_read[\s\S]*player_id = public\.current_user_canonical_player_id\(\) or public\.is_current_user_site_admin\(\)/)
  assert.match(sql, /course_challenge_submissions_own_insert[\s\S]*with check \(player_id = public\.current_user_canonical_player_id\(\)\)/)
  assert.match(sql, /course_challenge_profile_selection_own_read[\s\S]*player_id = public\.current_user_canonical_player_id\(\) or public\.is_current_user_site_admin\(\)/)
  assert.match(sql, /selected_reward_key is null[\s\S]*reward\.player_id = public\.current_user_canonical_player_id\(\)[\s\S]*reward\.reward_key = selected_reward_key/)
})

test("Course Challenge proof storage is private and admin access is scoped to its bucket", async () => {
  const sql = await readFoundation()
  const storageSection = sql.slice(sql.indexOf("insert into storage.buckets"))

  assert.match(storageSection, /values \('course-challenge-proof', 'course-challenge-proof', false\)/)
  assert.match(storageSection, /course_challenge_proof_own_upload[\s\S]*storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/)
  assert.match(storageSection, /course_challenge_proof_owner_or_admin_read[\s\S]*bucket_id = 'course-challenge-proof'[\s\S]*public\.is_current_user_site_admin\(\)/)
  assert.doesNotMatch(storageSection, /using \(bucket_id = 'course-challenge-proof' and[\s\S]*or public\.is_current_user_site_admin\(\)\);/)
})
