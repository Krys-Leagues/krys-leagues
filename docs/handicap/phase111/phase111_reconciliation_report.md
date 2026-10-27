# Phase 111 KWT Season 14 Weeks 5–12 reconciliation

- ZIP SHA-256: **E599CF6DF746F6C60C9718FBB73486396055567B738ED1A6EEB5808D2E2E46CE**
- Source files: **16** (8 detailed, 8 weekly summaries); encodings: {"WINDOWS-1252":16}.
- Detail/player-week observations: **371**; unique player-week keys: **371**; unique source names: **68**.
- Course observations staged locally: **742** (Easy and Hard preserved separately); exact identity-supported pair rows: **279**; unresolved/ambiguous pair rows: **92**.
- Exact summary reconciliations: **371**; non-exact rows: **0**.
- Exact name matches to existing authoritative KWT provenance: **48**; unresolved/ambiguous names are quarantined.
- Existing Production Season 14 W05–W12 provenance rows: **0** at read-only preflight; this package stages no Production writes.
- Duplicate player/week groups in the supplied package: **0**; no duplicate group was accepted.
- Supplied files do not contain the authoritative numeric source-player IDs and round IDs required for Production-compatible KWT fingerprints. Every staged row is therefore **blocked from import**, even when the summary and detail rows reconcile exactly.
- Weekly review uses the existing 844 verified course-score rows only. Weekly rows remain course-rating-only and are never personal Handicap input.

## Local impact simulation

- 742 new KWT course observations were usable for local statistics after exact field reconciliation and code-backed course lookup; they are not importable because source IDs/round IDs are absent.
- 68 player keys were available for local comparison; unresolved names remain visibly quarantined in the reconciliation CSV.
- Course and index comparisons are in phase111_course_rating_comparison.csv and phase111_player_index_comparison.csv. They are simulations only; no Phase 105 snapshot is changed.
## Safety result

**PARTIAL / BLOCKED FOR IMPORT:** source reconciliation is complete for accessible rows, but no Production-compatible append-only import package is authorized until authoritative KWT source IDs and round IDs are recovered. No scores, identities, snapshots, or Production rows were changed.
