import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import test from "node:test"

const page=readFileSync(new URL("../app/admin/solo/weeks/page.tsx",import.meta.url),"utf8")
const migration=readFileSync(new URL("../supabase/migrations/20260930030000_admin_solo_week_completion.sql",import.meta.url),"utf8")

test("Solo Weeks loads completion through one protected season-scoped RPC",()=>{
  assert.match(page,/rpc\("get_admin_solo_week_completion",\{p_season_id:id\}\)/)
  assert.doesNotMatch(page,/from\("solo_live_best_attempts"\)/)
  assert.match(page,/if\(se\|\|we\|\|re\|\|ae\|\|!s\|\|!r\|\|/)
  assert.match(page,/attempts\.filter\(x=>x\.week_id===week\.id\)/)
})

test("Solo completion RPC is restricted to site or Solo admins",()=>{
  assert.match(migration,/security definer\s+set search_path = ''/i)
  assert.match(migration,/auth\.uid\(\) is null/)
  assert.match(migration,/is_current_user_site_admin\(\)/)
  assert.match(migration,/is_current_user_solo_admin\(\)/)
  assert.match(migration,/attempt\.season_id = p_season_id/)
  assert.match(migration,/revoke all on function public\.get_admin_solo_week_completion\(uuid\) from public/)
  assert.match(migration,/revoke all on function public\.get_admin_solo_week_completion\(uuid\) from anon/)
  assert.match(migration,/grant execute on function public\.get_admin_solo_week_completion\(uuid\) to authenticated/)
})
