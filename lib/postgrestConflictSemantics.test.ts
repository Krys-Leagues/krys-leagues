import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync(
  new URL("../supabase/migrations/20261002112959_prevent_postgrest_40001_retry_storms.sql", import.meta.url),
  "utf8",
)
const roomScorecardRoute = readFileSync(
  new URL("../app/api/majors/room-scorecard/route.ts", import.meta.url),
  "utf8",
)

const previousDefinitions = {
  update_masters_stream_scorecard: readFileSync(
    new URL("../supabase/migrations/20261001210856_masters_stream_running_total_controls.sql", import.meta.url),
    "utf8",
  ),
  reorder_masters_stream_participants: readFileSync(
    new URL("../supabase/migrations/20261001210856_masters_stream_running_total_controls.sql", import.meta.url),
    "utf8",
  ),
  update_masters_simple_stream_total: readFileSync(
    new URL("../supabase/migrations/20261001214500_masters_simple_stream_totals.sql", import.meta.url),
    "utf8",
  ),
  record_major_room_scorecard_proof_service: readFileSync(
    new URL("../supabase/migrations/20260930175447_masters_room_instructions_shared_scorecard.sql", import.meta.url),
    "utf8",
  ),
  finalize_major_verification_discord_alert: readFileSync(
    new URL("../supabase/migrations/20260930230000_masters_operational_admin_help.sql", import.meta.url),
    "utf8",
  ),
} as const

const expectedConflictFunctions = [
  "update_masters_stream_scorecard",
  "reorder_masters_stream_participants",
  "update_masters_simple_stream_total",
  "record_major_room_scorecard_proof_service",
  "finalize_major_verification_discord_alert",
] as const

function functionBody(name: string, sql = migration) {
  const match = sql.match(new RegExp(
    `create or replace function public\\.${name}\\([\\s\\S]*?\\$function\\$;`,
    "i",
  ))
  assert.ok(match, `${name} must be replaced by the prevention migration`)
  return match[0]
}

function normalizeFunctionDefinition(sql: string) {
  return sql
    .replaceAll("'PT409'", "'40001'")
    .replaceAll("\r\n", "\n")
    .trim()
}

test("all five expected conflict functions use PT409 instead of retryable 40001", () => {
  for (const name of expectedConflictFunctions) {
    const body = functionBody(name)
    assert.match(body, /errcode\s*=\s*'PT409'/i, `${name} must return a non-retryable conflict`)
    assert.doesNotMatch(body, /errcode\s*=\s*'40001'/i, `${name} must not raise serialization_failure`)
  }
})

test("each function body is unchanged apart from the intentional SQLSTATE", () => {
  for (const name of expectedConflictFunctions) {
    assert.equal(
      normalizeFunctionDefinition(functionBody(name)),
      normalizeFunctionDefinition(functionBody(name, previousDefinitions[name])),
      `${name} must preserve its successful and validation paths exactly`,
    )
  }
})

test("optimistic locking and lease predicates remain intact", () => {
  for (const name of [
    "update_masters_stream_scorecard",
    "reorder_masters_stream_participants",
    "update_masters_simple_stream_total",
  ]) {
    const body = functionBody(name)
    assert.match(body, /for update/i)
    assert.match(body, /revision\s*<>\s*p_expected_revision/i)
    assert.match(body, /STALE_STREAM_REVISION/)
  }

  const proof = functionBody("record_major_room_scorecard_proof_service")
  assert.match(proof, /for update/i)
  assert.match(proof, /p_expected_proof_id is distinct from current_proof\.id/i)
  assert.match(proof, /The room scorecard photo changed\. Refresh before replacing it\./)

  const alert = functionBody("finalize_major_verification_discord_alert")
  assert.match(alert, /alert\.sync_token\s*=\s*p_sync_token/i)
  assert.match(alert, /if not found then/i)
  assert.match(alert, /Masters verification alert lease expired\./)
})

test("security definer, hardened search path, signatures, and grants are preserved", () => {
  for (const name of expectedConflictFunctions) {
    const body = functionBody(name)
    assert.match(body, /security definer/i)
    assert.match(body, /set search_path to ''/i)
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\(`, "i"))
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\(`, "i"))
  }

  assert.match(migration, /update_masters_stream_scorecard\(uuid, bigint, integer, jsonb, boolean\)/i)
  assert.match(migration, /reorder_masters_stream_participants\(uuid, bigint, uuid\[\]\)/i)
  assert.match(migration, /update_masters_simple_stream_total\(uuid, bigint, uuid, integer\)/i)
  assert.match(migration, /record_major_room_scorecard_proof_service\([\s\S]*?\) to service_role;/i)
  assert.match(migration, /finalize_major_verification_discord_alert\(uuid, uuid, text, text, text, text\)[\s\S]*?to service_role;/i)
})

test("room proof API preserves HTTP 409 mapping during and after migration rollout", () => {
  assert.match(roomScorecardRoute, /\["23505", "40001", "PT409"\]\.includes/)
})
