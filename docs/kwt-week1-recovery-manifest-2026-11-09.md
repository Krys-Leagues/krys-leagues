# KWT Week 1 Recovery Manifest

Status: Preview recovery checkpoint; no Production release approved.
Recorded: 2026-11-09 America/New_York

## Source

- Repository: `Krys-Leagues/krys-leagues`
- Branch: `codex/kwt-system-separation-20261101`
- Approved application commit: `730084d662751f14a3388bc6a3b9cef74a78dcde`
- Application root: `kwt-league-hub`
- Vercel project: `krys-kwt-league-hub`
- Vercel project ID: `prj_iOEKnC8k16Wm8Ac5JdoKilu3gh2Y`

## Preview checkpoint

- Deployment: `dpl_EFym6QZW2ovrQP1q88YuRmhEeQ3Y`
- URL: `https://krys-kwt-league-mznc9iita-krys-leagues-projects.vercel.app`
- Target: `preview`
- Status: `READY`
- Preview protection remains enabled.
- No Production promotion, DNS change, or database write was performed.

## Authoritative data source

- Supabase project: `Krys-Leagues`
- Project ref: `jfbndcwdsvsjgnzwvexp`
- Region: `us-east-1`
- Status at checkpoint: `ACTIVE_HEALTHY`

Read-only counts at checkpoint:

- `kwt_current_import_rows`: 46
- `historical_kwt_scorecards`: 7,177
- `player_trophies`: 98
- `handicap_publishable_index_snapshots`: 167
- `player_community_badges`: 0

Week 1 is `KWTS15W01`, Raptor Cliffs, committed with 46 rows. Stephen1D47 is canonical player `cfc0a8ef-49d6-4970-b5f6-d98b6d6ca115`, with official Easy `-14`, Hard `8`, Total `-6`. No published handicap snapshot was found at the `2026-10-23` cutoff; the application preserves the row as `UNPUBLISHED` rather than inventing a handicap.

## Preview environment safety

The KWT Vercel project currently lists only these Preview variables by name:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

No values are recorded here. No `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` is configured for KWT Preview. The server-side KWT adapter requires an approved restricted read-only credential under a server-only variable; a browser-visible `NEXT_PUBLIC_` value is not an acceptable substitute.

## Production checkpoint

The existing KWT project has one recorded Production deployment:

- Deployment: `dpl_FRNDuna37xuMGCXiJoj8pZeTCMAG`
- URL: `https://krys-kwt-league-nzx9xe0pw-krys-leagues-projects.vercel.app`
- Target: `production`
- Status: `ERROR`
- Source commit: `36a4eb94da6f93af03de47a7d2926d5a77826d37`
- Source branch: `codex/stroke-standalone-recovery-20261101`
- Source message: `Recover standalone Stroke Play application`

This deployment is not a KWT release and was not changed.

## Backup checkpoint

The available read-only Supabase project metadata and database tools did not expose a backup inventory or latest-backup timestamp. No restore or snapshot operation was attempted. Before any Production release, the Owner must confirm the latest available backup in the Supabase project Backup/Recovery panel and record its timestamp or identifier separately from this manifest.

## Rollback instructions

1. Do not promote a Preview deployment.
2. If a future KWT Production deployment is approved and fails, stop promotion and inspect the deployment logs.
3. Preserve the prior KWT Production deployment ID and promote only an explicitly approved known-good KWT Production deployment; do not roll back to the unrelated Stroke deployment listed above.
4. If database symptoms appear, stop the release and use the Owner-confirmed backup/recovery process. Do not reset or restore the database automatically.

## Release blocker

Add the Owner-approved restricted read-only Supabase credential to Vercel project `krys-kwt-league-hub`, Preview environment only, as `SUPABASE_SECRET_KEY` (or the already-approved server-only variable name if the credential owner specifies another). Then create a fresh Preview from the approved source commit and re-run the live Week 1 verification. Never add that credential to `NEXT_PUBLIC_*`, Git, logs, or Production.
