import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import test from "node:test"

const page=readFileSync(new URL("../app/admin/pro/schedule/page.tsx",import.meta.url),"utf8")

test("Pro season setup uses the protected canonical player directory",()=>{
  assert.match(page,/loadProtectedAdminPlayersResult\(\)/)
  assert.doesNotMatch(page,/from\("players"\)/)
})

test("admins can choose any active canonical player for a Pro division",()=>{
  assert.match(page,/filter\(\(player\) => player\.active === true\)/)
  assert.doesNotMatch(page,/player\.division === division/)
  assert.match(page,/map\(\(player\) => player\.screen_name\)/)
  assert.match(page,/sort\(\(a, b\) => a\.localeCompare\(b\)\)/)
})
