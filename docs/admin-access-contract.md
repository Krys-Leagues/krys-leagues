# Admin access contract

This contract is source-level and release-time; it does not grant database access and it does not execute SQL.

## Access classes

- Public-safe reads use a public server reader or a deliberately public RPC.
- User-self-service reads and writes are limited to the authenticated caller's own identity and remain protected by the self-service RPC/API contract.
- Site-admin data uses an `/api/admin/...` route. The route must call `authorizeSiteAdminMutation()` or an existing equivalent before parsing protected input or creating a privileged Supabase client.
- Browser code must not reference service-role or secret environment variables.
- Browser code must not call site-admin-only RPCs or read protected admin tables directly.

## Protected object families

The release audit treats `players`, `player_*`, `schedule`, `handicap_*`, `all_time_*`, `climbers_*`, `course_challenge_*`, `historical_*`, `major_*`, `stroke_*`, `match_*`, `pyp_*`, `kwt_*`, trophy, scorecard, and league setup/roster objects as protected unless a named public/self-service exception is documented.

## Database permission contract

Protected tables must not receive broad `anon` or `authenticated` SELECT/INSERT/UPDATE/DELETE grants as an admin UI workaround. RLS and RPC ACL drift is inspected by the read-only `npm run audit:database-permissions` command. The command emits the operator-approved catalog query for table RLS/grants and RPC EXECUTE ACLs, but this branch does not run it against Production.

## Current audit state

The changed-source gate is clean. The full source scan still reports legacy direct browser access in unrelated admin league pages/components; those findings are deliberately reported rather than added to a permissive allowlist. The complete route/page inventory is generated in `docs/admin-access-inventory.md`.

The scoped fixes in this branch move the Global Players detail/merge and duplicate-identity workflows behind authorized server routes, and retain only public/self-service client access where applicable. A future full hardening pass must migrate the remaining legacy findings before a strict zero-finding gate can be enabled.
