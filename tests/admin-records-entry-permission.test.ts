import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(path, "utf8")

test("All-Time Intake uses the protected server route instead of browser RPC execution", () => {
  const page = read("app/admin/records/entry/page.tsx")

  assert.match(page, /fetch\("\/api\/admin\/records\/entry"/)
  assert.match(page, /callAdminEntryRpc\("preview_verified_period"/)
  assert.match(page, /callAdminEntryRpc\("record_verified_period"/)
  assert.match(page, /callAdminEntryRpc\("record_normal_entry"/)
  assert.doesNotMatch(page, /supabase\.rpc\("(?:preview_all_time_verified_period_entry_v3|record_all_time_verified_period_entry_v3|record_all_time_normal_entry)"/)
})

test("protected All-Time entry route authorizes before reading the request", () => {
  const route = read("app/api/admin/records/entry/route.ts")
  const authorization = route.indexOf("await authorizeSiteAdminMutation()")
  const denial = route.indexOf("return authorization.response")
  const bodyRead = route.indexOf("request.json()")

  assert.ok(authorization >= 0)
  assert.ok(denial > authorization)
  assert.ok(bodyRead > denial)
  assert.match(route, /Cache-Control.*no-store/)
})

test("protected route dispatches the three existing RPCs without changing argument names", () => {
  const route = read("app/api/admin/records/entry/route.ts")
  const page = read("app/admin/records/entry/page.tsx")

  assert.match(route, /preview_verified_period: "preview_all_time_verified_period_entry_v3"/)
  assert.match(route, /record_verified_period: "record_all_time_verified_period_entry_v3"/)
  assert.match(route, /record_normal_entry: "record_all_time_normal_entry"/)
  assert.match(route, /authorization\.supabase\.rpc\(RPC_NAMES\[body\.action\], body\.args\)/)

  for (const name of [
    "p_period_id",
    "p_course_id",
    "p_player_id",
    "p_entry_key",
    "p_fingerprint",
    "p_score",
    "p_hole_strokes",
    "p_entry_type",
    "p_source_label",
    "p_provenance_reference",
    "p_notes",
    "p_authoritative_submitted_at",
    "p_authoritative_submitted_date",
    "p_authoritative_submission_order",
    "p_authoritative_time_precision",
    "p_verified_source_batch_id",
    "p_confirmation_token",
  ]) assert.match(page, new RegExp(`${name}:`))
})

test("unauthorized access and ACL safety remain fail-closed", () => {
  const route = read("app/api/admin/records/entry/route.ts")
  const page = read("app/admin/records/entry/page.tsx")

  assert.match(route, /if \(!authorization\.authorized\) return authorization\.response/)
  assert.doesNotMatch(`${page}\n${route}`, /GRANT\s+EXECUTE\s+TO\s+anon|GRANT\s+SELECT|ALTER\s+TABLE|CREATE\s+POLICY/i)
})

test("All-Time and Climbers preview/confirmation workflow remains present", () => {
  const page = read("app/admin/records/entry/page.tsx")

  assert.match(page, /previewEntry\(\)/)
  assert.match(page, /saveEntry\(/)
  assert.match(page, /confirmed/)
  assert.match(page, /p_confirmation_token/)
  assert.match(page, /Climbers points will be calculated after save using the verified source order/)
  assert.match(page, /scorecardFile/)
  assert.match(page, /fingerprintForEntry/)
})
