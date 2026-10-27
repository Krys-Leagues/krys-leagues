# Phase 96 — approved KWT chronology policy

## Scope

Krys approved `OFFICIAL_KWT_SEQUENCE` as qualifying chronology for validated
historical KWT Easy/Hard pairs. It is not an exact play timestamp and does not
convert the tournament's three-minute rule into a historical timestamp.

The local policy accepts only a complete official pair with one Easy result and
one Hard result for the same canonical player, season, and week. It rejects
missing or conflicting pairs, duplicate source fingerprints, unsupported
identities, and unverified evidence. Ordering remains:

`Season → Week → Easy → Hard`

Weekly evidence remains course-rating-only.

## Local behavior

The engine now has an explicit `EXACT_OR_OFFICIAL_KWT_SEQUENCE` opt-in. The
default remains `EXACT_ONLY`, so callers cannot accidentally make sequence
chronology publishable. The personal-index candidate builder also defaults to
`EXACT_ONLY` and always emits `UNPUBLISHED` snapshot candidates.

When the opt-in is used, the local index result can be marked as eligible under
the approved chronology policy, while its snapshot remains unpublished until a
separately approved run, rating versions, effective date, provenance review,
and database publication gate all pass.

## Production proposal

`supabase/proposals/20261020_handicap_official_kwt_sequence_publication_gate.proposed.sql`

The proposal only:

1. adds `OFFICIAL_KWT_SEQUENCE` to the index chronology constraint;
2. updates the existing security-invoker index view; and
3. requires both `chronology_policy = 'OFFICIAL_KWT_SEQUENCE'` and
   `metadata.allow_official_kwt_sequence_publication = true` for that path.

The exact-timestamp path remains unchanged. Client grants, RLS, append-only
guards, existing runs, ratings, and indexes are not changed. The proposal has
not been installed.
