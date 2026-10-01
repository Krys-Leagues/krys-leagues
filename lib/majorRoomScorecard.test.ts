import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { isCompleteMastersRoomRoster, MAJOR_ROOM_SCORECARD_MAX_BYTES, validMajorRoomScorecardFile } from "./majorRoomScorecard.ts"

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
const migration = read("supabase/migrations/20260930175447_masters_room_instructions_shared_scorecard.sql")

test("shared Masters room proof is additive, private, immutable by version, and service-only", () => {
  assert.match(migration, /create table if not exists public\.major_room_scorecard_proofs/)
  assert.match(migration, /alter table public\.major_room_scorecard_proofs force row level security/)
  assert.match(migration, /revoke all on table public\.major_room_scorecard_proofs from public, anon, authenticated/)
  assert.match(migration, /grant select, insert, update on table public\.major_room_scorecard_proofs to service_role/)
  assert.match(migration, /where replaced_at is null/)
  assert.match(migration, /replaced_by_player_id/)
  assert.match(migration, /replaces_proof_id uuid references public\.major_room_scorecard_proofs\(id\)/)
  assert.match(migration, /p_expected_proof_id is distinct from current_proof\.id/)
  assert.match(migration, /upsert: false|on conflict \(id\) do update/i)
  assert.doesNotMatch(migration, /delete from public\.major_room_scorecard_proofs/i)
})

test("room upload authorization requires exact complete published membership", () => {
  assert.match(migration, /room\.is_published/)
  assert.match(migration, /member_count not between 2 and 4/)
  assert.match(migration, /entry\.player_id = p_uploader_player_id/)
  assert.match(migration, /entry\.status in \('registered', 'confirmed'\)/)
  assert.match(migration, /day\.day_number <= 2 or event\.weekend_status_published_at is not null/)
  assert.match(migration, /auth\.role\(\) <> 'service_role'/)
})

test("protected player route authorizes before private storage and requires explicit replacement", () => {
  const route = read("app/api/majors/room-scorecard/route.ts")
  const getBody = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"))
  const postBody = route.slice(route.indexOf("export async function POST"))
  assert.ok(getBody.indexOf("authorizeRoom(playDayId)") < getBody.indexOf("currentProof(authorization.context.group_id)"))
  assert.ok(postBody.indexOf("authorizeRoom(playDayId)") < postBody.indexOf("createScorecardServiceClient()"))
  assert.match(route, /get_my_major_room_scorecard_context/)
  assert.match(route, /action === "replace"/)
  assert.match(route, /p_expected_proof_id/)
  assert.match(route, /upsert: false/)
  assert.match(route, /remove\(\[storagePath\]\)/)
  assert.doesNotMatch(route, /OPENAI|OCR|extract|parse.*score/i)
})

test("only supported image evidence within the private bucket limit is accepted", () => {
  assert.equal(validMajorRoomScorecardFile({ type: "image/jpeg", size: 42 }), true)
  assert.equal(validMajorRoomScorecardFile({ type: "image/webp", size: MAJOR_ROOM_SCORECARD_MAX_BYTES }), true)
  assert.equal(validMajorRoomScorecardFile({ type: "text/plain", size: 42 }), false)
  assert.equal(validMajorRoomScorecardFile({ type: "image/png", size: MAJOR_ROOM_SCORECARD_MAX_BYTES + 1 }), false)
  assert.equal(validMajorRoomScorecardFile({ type: "image/png", size: 0 }), false)
})

test("the same shared room proof supports every complete two- to four-player roster", () => {
  const roster = Array.from({ length: 5 }, (_, index) => ({ player_id: String(index), player_screen_name_snapshot: `Player ${index + 1}` }))
  assert.equal(isCompleteMastersRoomRoster(roster.slice(0, 1)), false)
  for (const size of [2, 3, 4]) assert.equal(isCompleteMastersRoomRoster(roster.slice(0, size)), true)
  assert.equal(isCompleteMastersRoomRoster(roster), false)
})

test("one proof is shown above each player's existing self-owned numeric entry", () => {
  const player = read("app/majors/[slug]/scoring/page.tsx")
  const component = read("components/majors/MajorRoomScorecardPhoto.tsx")
  const existingScoring = read("major_player_scoring_verification.sql")
  assert.ok(player.indexOf("<MajorRoomScorecardPhoto") < player.indexOf("YOUR SCORE"))
  assert.match(component, /SUBMIT ROOM SCORECARD PHOTO/)
  assert.match(component, /REPLACE ROOM SCORECARD PHOTO/)
  assert.match(component, /one photo is shared with every assigned player/i)
  assert.match(existingScoring, /me:=public\.current_major_player_id\(\)/)
  assert.match(existingScoring, /where id=p_scorecard_id and player_id=me for update/)
})

test("missing or failed room proof never blocks individual scoring or submission", () => {
  const player = read("app/majors/[slug]/scoring/page.tsx")
  const component = read("components/majors/MajorRoomScorecardPhoto.tsx")
  const scoringMigration = read("supabase/migrations/20260930190131_masters_player_rooms_rules_and_scoring_access.sql")
  const saveFunction = scoringMigration.match(/create or replace function public\.save_my_major_scorecard[\s\S]*?\$function\$;/)?.[0] || ""
  const submitFunction = scoringMigration.match(/create or replace function public\.submit_my_major_scorecard[\s\S]*?\$function\$;/)?.[0] || ""

  assert.match(component, /ROOM SCORECARD PHOTO ISSUE/)
  assert.match(component, /You can still enter and submit your 18-hole scores\./)
  assert.match(component, /setPhotoIssue\(true\)/)
  assert.match(component, /catch \{/)
  assert.ok(player.indexOf("<MajorRoomScorecardPhoto") < player.indexOf("YOUR SCORE"))
  assert.match(player, /SAVE DRAFT/)
  assert.match(player, /SUBMIT SCORECARD/)
  assert.doesNotMatch(saveFunction, /major_room_scorecard_proofs/)
  assert.doesNotMatch(submitFunction, /major_room_scorecard_proofs/)
})

test("admin verification is authorized and receives room, roster, instructions, scores, and shared proof", () => {
  const route = read("app/api/admin/majors/room-scorecards/route.ts")
  const page = read("app/admin/majors/verification/page.tsx")
  assert.ok(route.indexOf("authorizeSiteAdminMutation()") < route.indexOf("createScorecardServiceClient()"))
  for (const field of ["room_group_id", "room_instructions", "room_roster"]) assert.match(migration, new RegExp(field))
  assert.match(page, /RoomVerification/)
  assert.match(page, /room\.roster\.map/)
  assert.match(page, /room\.instructions/)
  assert.match(page, /ROOM SCORECARD/)
  assert.match(page, /card\.holes\.map/)
  assert.match(page, /ScorecardZoomControls/)
})
