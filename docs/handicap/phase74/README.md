# Phase 74 — quarantine/publication gate validation

Status: **PREPARED ONLY — NOT AUTHORIZED FOR PRODUCTION EXECUTION**

## Verified baseline

- Supabase project: `jfbndcwdsvsjgnzwvexp`
- Current website alias: `krysleagues.com` → `dpl_FFhaRXdqWXEUxMg3AnQkKFFvJ3`
- Phase 73 source checkpoint: `35559e6ac89542031a6553d3ab59c87620ca8f64`
- Phase 73 proposal SHA-256: `6A011DE77AA11BE461FC68788849ABA1C6E945C99630CB3A3DD15507C7D11979`

Read-only Production preflight found the expected Phase 67 invalid batch:

- one `DRAFT` calculation run: `5a57560c-3548-54a8-879c-8fc516a85f26`
- `14,394` provenance rows
- `169` rating snapshots, all `UNPUBLISHED`
- `0` player-index snapshots
- `13,550` KWT rows missing canonical UUID/source-player metadata and using malformed fingerprints
- `844` Weekly rows, with no personal-Handicap linkage

The two Phase 73 publication views are absent in Production. No Production
mutation was performed.

## Local runtime result

The existing PostgreSQL 17.11 binaries were used without reinstalling. A
single-process Phase 74 harness started a disposable cluster on TCP port
`55475`; PostgreSQL reached `ready to accept connections`, but the restricted
Codex environment rejected the client socket with Windows error `10013`.
A separate named-pipe check returned `10061` because this PostgreSQL build does
not expose the unsupported `enable_named_pipes` configuration parameter.

```text
connection to server at "127.0.0.1" failed:
Permission denied (0x0000271D/10013)
```

This is an execution-environment socket restriction, not a schema assertion.
No further identical startup attempts should be made. The database runtime
validation is therefore **BLOCKED — ENVIRONMENT**; static contract tests remain
available.

## User-executable local command

From the repository root, run this once in an ordinary local PowerShell
session with PostgreSQL 17.11 available:

```powershell
node .\scripts\phase74_handicap_quarantine_local.mjs
```

The harness starts PostgreSQL, runs the complete disposable validation, prints
PASS/FAIL assertions, stops the server, and removes its temporary cluster.
Set `$env:KRYS_PG_HOST` only if the local machine requires a different loopback
hostname; do not point it at Production.

## Gate contract

The proposal is unchanged and remains additive at the contract level:

1. Calculation runs default to `QUARANTINED` and require explicit `ELIGIBLE`.
2. Official rating selection requires a completed eligible run, `PUBLISHED`
   status, effective date, positive slope, evidence, and valid provenance.
3. Official index selection additionally requires `EXACT` chronology and KWT
   provenance only.
4. Weekly provenance is allowed only for course-rating selection and is
   rejected by the index view.
5. The views use `security_invoker = true`, have no client grants, and grant
   `SELECT` only to `service_role`.
6. The invalid Phase 67 run and snapshots remain auditable but cannot become
   official through insertion alone.

## Installation boundary

The proposal must not be run in Production until the local database harness
can execute successfully in an authorized environment. When that gate is
cleared, use the SELECT-only preflight, execute the exact proposal checksum
above transactionally, and run the SELECT-only postflight. Do not combine it
with Phase 72 recovery, rating publication, index publication, or application
deployment.

Files in this package:

- `production_quarantine_preflight.sql` — SELECT-only gate
- `production_quarantine_postflight.sql` — SELECT-only verification
- `../../../scripts/phase74_handicap_quarantine_local.mjs` — disposable local
  compatibility harness

