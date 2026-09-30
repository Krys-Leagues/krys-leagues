import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import test from "node:test"

const sql=readFileSync(new URL("../supabase/migrations/20260930030500_protect_legacy_public_mutations.sql",import.meta.url),"utf8")

test("browser roles cannot truncate application tables",()=>{
  assert.match(sql,/revoke truncate on all tables in schema public from anon, authenticated/i)
})

test("legacy fixture and membership writes require canonical site-admin authorization",()=>{
  assert.doesNotMatch(sql,/create policy [\s\S]*to (?:public|anon)[\s\S]*with check \(true\)/i)
  for(const table of ["fixtures","player_leagues"]){
    assert.match(sql,new RegExp(`on public\\.${table} for insert[\\s\\S]*is_current_user_site_admin\\(\\)`,`i`))
    assert.match(sql,new RegExp(`on public\\.${table} for update[\\s\\S]*is_current_user_site_admin\\(\\)`,`i`))
    assert.match(sql,new RegExp(`on public\\.${table} for delete[\\s\\S]*is_current_user_site_admin\\(\\)`,`i`))
    assert.match(sql,new RegExp(`revoke insert, update, delete on table public\\.${table} from anon`,`i`))
  }
})

test("legacy admin identities are no longer publicly readable or writable",()=>{
  assert.match(sql,/drop policy if exists "allow admin read" on public\.admin_users/i)
  assert.match(sql,/on public\.admin_users for select[\s\S]*is_current_user_site_admin\(\)/i)
  assert.match(sql,/revoke all privileges on table public\.admin_users from anon/i)
  assert.match(sql,/grant select on table public\.admin_users to authenticated/i)
})
