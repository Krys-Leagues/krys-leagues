# Phase 73 — invalid-batch quarantine and publication gate

Status: **PREPARED ONLY — NOT AUTHORIZED FOR PRODUCTION EXECUTION**

## Verified baseline

- Supabase project: `jfbndcwdsvsjgnzwvexp`
- Current website alias: `krysleagues.com` → `dpl_FFhaRXdqWXEUxMg3AnQkKFFvJ3`
- Invalid Phase 67 run: `5a57560c-3548-54a8-879c-8fc516a85f26`, status `DRAFT`
- Invalid batch: `14,394` provenance rows and `169` unpublished rating snapshots
- Invalid KWT rows: `13,550` without canonical player UUID/source-player metadata and with malformed fingerprints
- Weekly rows: `844`, external and course-rating-only
- Player-index snapshots: `0`

## Contract decision

The smallest safe enforceable boundary is a run-level `publication_eligibility`
column with a fail-closed `QUARANTINED` default, combined with two invoker-
security service-role-only views. An official rating requires:

1. a `COMPLETED` run explicitly marked `ELIGIBLE`;
2. a `PUBLISHED` snapshot with a non-null effective date, positive slope, and evidence;
3. every evidence fingerprint to resolve exactly to valid KWT or course-only Weekly provenance.

An official player index additionally requires exact chronology and KWT-only
source-round references. Missing eligibility, missing provenance, malformed KWT
identity metadata, Weekly personal-use metadata, and unresolved source references
all fail closed. The existing invalid run therefore remains auditable but cannot
be selected. The current 169 snapshots remain unpublished and cannot be selected.

The proposal extends the snapshot status check to permit a future `PUBLISHED`
state, but does not publish or modify any existing row. It does not alter RLS,
client grants, legacy Handicap tables, or append-only triggers.

## Reader requirement

Future server/RPC readers must select only from:

- `public.handicap_publishable_rating_snapshots`
- `public.handicap_publishable_index_snapshots`

They must not read the base snapshot tables for official output and must not
fall back to legacy Handicap tables. `THE_WEEKLY` may pass the rating view for
course-rating evidence, but the index view rejects it as personal source input.

## Phase 72 compatibility

The Phase 72 recovery transaction remains insert-only and does not need to be
executed. Under this contract, its corrected run would receive the default
`QUARANTINED` state and its 169 snapshots would remain `UNPUBLISHED`; no
recovery batch becomes official by insertion alone. A later review must create
an explicitly eligible completed run and a separate published snapshot set.

## Safety boundary

`20261020_handicap_quarantine_publication_gate.proposed.sql` is a proposal only.
No Production SQL, migration, data recovery, publication, Vercel deployment,
Git push, paid staging, Discord, or Railway action was performed by Phase 73.
