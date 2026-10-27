import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const sql = readFileSync(join(process.cwd(), "supabase/proposals/20261025_lynne_reusable_tournament_builder.proposed.sql"), "utf8")

test("control-center proposal keeps exact bracket cardinalities and lifecycle states", () => {
  assert.match(sql, /bracket_size integer not null check \(bracket_size in \(32, 64\)\)/i)
  assert.match(sql, /status in \('draft', 'registration_open', 'registration_closed', 'live', 'completed', 'archived', 'cancelled'\)/i)
  assert.match(sql, /v_rounds := floor\(log\(2, p_bracket_size\)\)[\s\S]*jsonb_array_length\(coalesce\(p_rounds/i)
  assert.match(sql, /v_match_count := p_bracket_size \/ \(2 \^ v_round\)/i)
})

test("control-center proposal requires time zones and audits live deadline extensions", () => {
  assert.match(sql, /pg_catalog\.pg_timezone_names/i)
  assert.match(sql, /player_timezone text/i)
  assert.match(sql, /tournament_deadline_changes/i)
  assert.match(sql, /written reason is required for a live deadline change/i)
  assert.match(sql, /old_deadline_at, new_deadline_at, schedule_timezone, reason, changed_by/i)
})

test("private tournament evidence has no anonymous or authenticated table grants", () => {
  assert.match(sql, /revoke all on public\.tournament_templates,[\s\S]*from public, anon, authenticated/i)
  assert.match(sql, /grant all on public\.tournament_templates,[\s\S]*to service_role/i)
  assert.match(sql, /tournament_scorecard_submissions/i)
  assert.match(sql, /tournament_secret_par_access/i)
})

test("registration and lifecycle functions are role scoped", () => {
  assert.match(sql, /register_for_tournament\(p_tournament_id uuid, p_player_timezone text\)/i)
  assert.match(sql, /admin_update_tournament_control\(/i)
  assert.match(sql, /revoke all on function public\.admin_update_tournament_control[\s\S]*from public, anon/i)
  assert.match(sql, /tournament_match_schedule_offers/i)
  assert.match(sql, /player_match_schedule_action\(/i)
  assert.match(sql, /confirm_tournament_winner\(/i)
  assert.match(sql, /confirm_tournament_winner\([\s\S]*update public\.tournament_matches as next_match/i)
  assert.match(sql, /request_tournament_forfeit\(/i)
  assert.match(sql, /admin_force_tournament_advance\(/i)
  assert.match(sql, /revoke all on function public\.admin_force_tournament_advance\(uuid, uuid, uuid, text\) from public, anon/i)
  assert.match(sql, /admin_record_tournament_rewind\(/i)
  assert.match(sql, /admin_record_secret_par_access\(/i)
  assert.match(sql, /auth\.identities[\s\S]*provider = 'discord'/i)
  assert.doesNotMatch(sql, /auth\.jwt\(\)\s*->\s*'user_metadata'/i)
})

