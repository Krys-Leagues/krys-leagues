import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const dependencies = fs.readFileSync(new URL("../supabase/proposals/20261017_doubles_completion_dependencies.proposed.sql", import.meta.url), "utf8")
const preflight = fs.readFileSync(new URL("../docs/doubles-completion-preflight-readonly.sql", import.meta.url), "utf8")
const runtime = fs.readFileSync(new URL("../doubles_completion_runtime.sql", import.meta.url), "utf8")

test("completion proposal contains only additive protected dependency objects", () => {
  for (const table of [
    "doubles_season_member_replacements",
    "doubles_season_lifecycle",
    "doubles_final_snapshots",
    "doubles_board_mappings",
    "doubles_board_outbox",
  ]) assert.match(dependencies, new RegExp(`create table if not exists public\\.${table}`))
  assert.match(dependencies, /enable row level security/)
  assert.match(dependencies, /revoke all on table/)
  assert.doesNotMatch(dependencies, /\b(drop\s+table|delete\s+from|truncate\s+table)\b/i)
})

test("completion preflight is read-only and runtime remains separately gated", () => {
  assert.doesNotMatch(preflight, /\b(insert|update|delete|drop|alter|create|truncate|do)\b/i)
  assert.match(runtime, /is_current_user_site_admin/)
  assert.doesNotMatch(runtime, /status\s*=\s*'active'/)
  assert.match(runtime, /status\s*=\s*'ACTIVE'/)
  assert.match(runtime, /revoke all on function public\.finalize_doubles_season/)
  assert.match(runtime, /grant execute on function public\.finalize_doubles_season\(uuid\) to authenticated/)
})

test("completion runtime names every proposed dependency and preserves the current managed schema", () => {
  for (const table of ["doubles_season_lifecycle", "doubles_final_snapshots", "doubles_board_mappings", "doubles_final_scorecards"]) {
    assert.match(runtime, new RegExp(`public\\.${table}`))
  }
  assert.match(dependencies, /public\.doubles_board_outbox/)
  assert.match(preflight, /'doubles_board_outbox'/)
  assert.match(runtime, /references public\.seasons\(id\) on delete restrict/)
  assert.match(runtime, /references auth\.users\(id\) on delete set null/)
  assert.match(runtime, /for update/)
  assert.match(runtime, /on conflict \(season_id\) do update/)
})
