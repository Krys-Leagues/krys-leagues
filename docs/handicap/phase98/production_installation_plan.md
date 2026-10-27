# Phase 98 controlled installation plan

This is a future review package only. Do not execute automatically.

1. Read-only preflight the six persistence tables, Phase 97 gate, current row counts, existing run IDs, and all deterministic IDs in this package.
2. Verify the calculation run ID, package hashes, every rating snapshot reference, canonical player UUID, KWT-only source type, and unpublished statuses.
3. Insert one DRAFT/QUARANTINED calculation run and the 157 unpublished index snapshots in one transaction using the approved service-role workflow.
4. Assert no Weekly source fingerprint appears in any index array and no legacy Handicap tables are touched.
5. Run postflight: existing counts plus one run and 157 index rows; zero publishable rows while the run is DRAFT/QUARANTINED and ratings remain UNPUBLISHED.
6. Any mismatch aborts the transaction; no UPDATE/DELETE/legacy rebuild is permitted.

No effective date is invented. Publication requires a separately reviewed activation step and the installed Phase 97 gate.
