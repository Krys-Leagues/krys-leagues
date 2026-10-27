# Phase 144 Public Handicap RPC Security Package

Status: **LOCAL PREPARATION ONLY — NOT INSTALLED**

The Phase 143 private helper is eliminated. The replacement creates one `postgres`-owned `SECURITY DEFINER` public function with `SET search_path = ''` and fully qualified objects. It projects only the safe fields from `public.handicap_publishable_index_snapshots` joined to `public.players`. No direct snapshot/view SELECT grants are added, no private helper exists, and the existing identity-bound self-read RPC is not changed.

The function returns only published rows admitted by the existing publication view. Draft, quarantined, unpublished, rejected, Weekly personal-round, source-round, rating-snapshot, provenance, and review-evidence fields are not returned.

## Validation

- Production read-only preflight: passed against `jfbndcwdsvsjgnzwvexp`.
- Disposable PostgreSQL 17.11 role harness: passed.
- Anonymous published read: passed.
- Authenticated published read: passed.
- Unpublished row hidden: passed.
- Private helper absent and directly denied: passed.
- Direct snapshot-table access denied: passed.
- Existing self-read RPC unchanged: passed.
- Private fields excluded: passed.
- Handicap suite: 219 passed.
- TypeScript, ESLint, and `git diff --check`: passed.

Production installation requires a new explicit authorization for the Phase 144 installation SQL checksum in `checksums.json`. The existing Phase 143 checksum must not be reused.
