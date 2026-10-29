import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const sqlFiles = ["major_masters_signup_groups_and_cut.sql"]

test("Major signup SQL uses the finalized Top 10 Main Event leaderboard for VIP priority", () => {
  for (const file of sqlFiles) {
    const sql = readFileSync(file, "utf8")
    assert.match(sql, /priority_source_event_id[\s\S]{0,500}field_placement between 1 and 10/u, file)
    assert.match(sql, /weekend_field='main'[\s\S]{0,220}result_status='completed'[\s\S]{0,120}is_finalized/u, file)
    assert.doesNotMatch(sql, /major_entries where major_event_id=signup_event\.priority_source_event_id[\s\S]{0,180}status not in/u, file)
  }
})
