# Doubles Completion Installation Plan

Status: preparation only. No Production DDL, DML, migration, season creation, or deployment was performed.

## Verified baseline

- Application checkpoint: `28d056fd1433b417f8fa940c0bd624ae23c35888`.
- Production deployment audited: `dpl_ACfuGpxJHHJtzxiWcwW7v2GjePa6`.
- Production deployment is READY, CLI-created, and aliased to `krysleagues.com`.
- Production Supabase project: `jfbndcwdsvsjgnzwvexp` (`Krys-Leagues`), healthy.
- Existing disposable projects were discovered, but both `krys-rls-staging` and `krys-leagues-preview` are INACTIVE. They were not used.

The live database currently has the current-generation managed Doubles tables and writers, but no managed Doubles season data:

| Object/data | Current Production finding |
| --- | --- |
| `doubles_global_teams` | 24 rows |
| `doubles_managed_season_teams` | 0 rows |
| `doubles_season_team_members` | 0 rows |
| `doubles_managed_fixtures` | 0 rows |
| `doubles_managed_results` | 0 rows |
| `doubles_managed_standings` | 0 rows |
| `doubles_historical_public_standings` | 16 historical rows |
| `doubles_final_scorecards` | absent |
| `doubles_season_lifecycle` | absent |
| `doubles_final_snapshots` | absent |
| `doubles_season_member_replacements` | absent |
| `doubles_board_mappings` | absent |
| `doubles_board_outbox` | absent |
| final-scorecard functions | absent |

The current managed schema uses uppercase lifecycle values, including `doubles_managed_season_teams.status IN ('ACTIVE','INACTIVE')`. The local runtime was corrected to use `ACTIVE`; the original lowercase comparison would otherwise make a configured season fail the finalization precondition.

## Required dependency order

1. Run the read-only preflight and save its output with the release review.
2. Confirm the applied current-generation migration `20261003120000_doubles_match_play_current.sql` and the live columns, constraints, function signatures, and security-definer authorization helper.
3. Apply the dependency proposal `supabase/proposals/20261017_doubles_completion_dependencies.proposed.sql` as one reviewed transaction. It creates only the lifecycle, replacement, snapshot, board-mapping, and board-outbox tables; it creates no season, team membership, fixture, result, or history rows.
4. Re-run the preflight. Stop if any existing object has a conflicting shape; `IF NOT EXISTS` is not a substitute for shape verification.
5. Apply the reviewed `doubles_completion_runtime.sql` as a separate transaction. It creates `doubles_final_scorecards` and the three admin-only finalization functions.
6. Re-run the preflight and security checks.
7. Only after schema approval, separately configure a managed season through the admin workflow. Season creation and enrollment are operational decisions, not migration steps.
8. Publish fixtures only after teams, members, courses, and deadlines are reviewed. The public reader should then expose only fixtures with `published_at IS NOT NULL` and an allowed live status.

Do not combine dependency DDL, runtime DDL, season creation, fixture creation, publication, and score submission in one release. That separation makes rollback and audit boundaries clear.

## Read-only preflight

Use `docs/doubles-completion-preflight-readonly.sql` against the intended environment. It must remain read-only: no `CREATE`, `ALTER`, `INSERT`, `UPDATE`, `DELETE`, function invocation, or migration execution.

The preflight must capture:

- applied Doubles migration versions;
- presence of every dependency and runtime table;
- signatures of the current managed writers and future finalization functions;
- managed row counts;
- existing Doubles seasons;
- RLS policy state for the new and current-generation tables.

Production currently has no managed Doubles season and no managed rows to migrate. Historical tables and the legacy Season 203 fixture are outside the completion path and must remain untouched.

## Schema and security review gates

Before applying either SQL file in a disposable, explicitly authorized staging database:

- verify every foreign key points at the live table and column names;
- verify `ON DELETE RESTRICT` preserves season/team/player history;
- verify unique keys prevent duplicate lifecycle, snapshot, scorecard, and board-mapping rows;
- verify all new tables have RLS enabled and no direct `anon`/`authenticated` table grants;
- verify `doubles_board_outbox.mapping_id` is the only worker linkage to `doubles_board_mappings` and its idempotency key remains unique;
- verify the three finalization functions use `SECURITY DEFINER`, `search_path = ''`, fully qualified relations, and the existing site-admin guard;
- verify execute is revoked from `public`, `anon`, and `authenticated` before the intended authenticated grant is applied;
- verify the runtime does not create a season, enroll a team, publish a fixture, write a score, or alter historical data;
- verify the finalization path is idempotent: a second generation refreshes a draft, a second approval is rejected, and a second finalization does not duplicate snapshots;
- verify board sync remains an explicit worker action and does not publish a fixture implicitly.

The existing production tables are protected through RPC/admin API patterns and currently do not expose ordinary `pg_policies` rows. Do not add broad public policies as part of this installation. Any policy change requires a separate security review.

## Expected rollback behavior

Each reviewed SQL file should execute transactionally. If a statement fails, the transaction must roll back and the operator must stop. Do not manually drop partial objects in Production.

If a disposable staging run fails:

1. retain the error and transaction log;
2. discard/reset only that disposable environment through its approved workflow;
3. correct the proposal or runtime source locally;
4. rerun static tests and the read-only preflight;
5. repeat staging only after schema compatibility is re-reviewed.

If Production application later fails after an approved schema install, stop application writes, preserve the database objects for forensic review, and use a reviewed forward-fix or a documented rollback plan. Do not delete historical rows or use `DROP ... CASCADE`.

## Post-install checks

After each approved staging/install step, run read-only checks for:

- exact table and function presence;
- RLS enabled on all new tables;
- no public/anonymous/authenticated table grants;
- only approved authenticated function execution grants;
- zero unexpected Doubles seasons or rows created by the DDL;
- no changes to historical Doubles tables, player identities, or legacy schedule/results;
- `doubles_final_scorecards` empty until an admin explicitly generates one;
- no final snapshots or lifecycle rows before a season is finalized.

After a season is later configured, verify the complete lifecycle with a disposable season: private team assignment, private fixture creation, publication, two-course score submission, admin verification, standings rebuild, final-scorecard generation, approval, finalization, snapshot creation, and a second idempotent finalization.

## Current blockers

- No active disposable staging database is available for execution; the discovered preview/staging projects are inactive and no new project/branch was created.
- Production has no managed Doubles season, so the runtime cannot be exercised against a legitimate configured season yet.
- The repository has no dedicated Doubles season-creation RPC; the existing Season Manager writes the shared `seasons` table directly. Creating a season still requires an explicit administrator decision and a controlled workflow review.
- The completion runtime introduces `doubles_board_mappings`, while the current Discord worker uses the existing `doubles_discord_division_mappings`/outbox family. Board mapping ownership must be reconciled before finalization is enabled; this is not safe to infer from table names.
