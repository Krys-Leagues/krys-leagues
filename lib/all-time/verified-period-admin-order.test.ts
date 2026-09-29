import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(path, "utf8")
const sql = read("supabase/migrations/20260929000000_verified_period_admin_order.sql")

test("protected historical entry assigns scorecard source and the next order server-side", () => {
  assert.match(sql, /'SCORECARD'/)
  assert.match(sql, /verified_source_batch_id=v_source_batch/)
  assert.match(sql, /coalesce\(max\(o\.authoritative_submission_order\),0\)\+1/)
  assert.match(sql, /for update/)
  assert.match(sql, /v_period\.starts_at::date/)
  assert.match(sql, /p_authoritative_submission_order integer/)
  assert.match(sql, /'SCORECARD',null,null,null,v_date,v_order,'date_ordered'/)
  assert.match(sql, /grant execute on function public\.record_all_time_verified_period_entry_v2/)
})

test("same-date mixed exact metadata does not remain a replay blocker", () => {
  assert.doesNotMatch(sql, /Exact-time and date\/order sources are mixed on one date/)
  assert.match(sql, /case when o\.entry_type='verified_period' then 'date_ordered'/)
  assert.match(sql, /unit_key like 'verified:%' then 1/)
})

test("replay protections and automatic flow remain admin-only", () => {
  assert.match(sql, /is_current_user_site_admin\(\)/)
  assert.match(sql, /climbers-source-v2:/)
  assert.match(sql, /Replay would reduce a previously earned Climbers event/)
  assert.match(sql, /create or replace function public\.replay_climbers_verified_period_v2/)
})
