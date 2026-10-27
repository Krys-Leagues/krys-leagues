# Phase 138 corrected rating-decision package

Status: **PREPARED LOCALLY; NOT EXECUTED IN PRODUCTION**.

The Phase 132 owner-approved rows were reconciled by exact course, difficulty, rating and slope to the current Production snapshot IDs recorded by the Phase 136 lineage package. The installer inserts only 73 evidence rows and 73 ACCEPT decisions. It does not insert or modify runs, provenance, ratings, indexes, identities, or publication state.

- Production project: jfbndcwdsvsjgnzwvexp
- Owner-approved batch SHA-256: 52D2D88FD821F231148FCCC1C90C85BF32D34FA9156C2A8C2F3D75CD2CF53C0B
- Phase 130 checkpoint: da2d139d63e96e79303da665449bb821a23398a7
- Phase 125 checkpoint: dfd3558109a6dcbd00703feadd52acb2276dc899
- Phase 136 checkpoint: 5a780511c5730c239e82abd92da2c34cc008321f
- Expected existing counts: 5 runs, 28,672 provenance, 427 ratings, 157 indexes, 1 evidence, 1 decision
- Expected after installation: 5 runs, 28,672 provenance, 427 ratings, 157 indexes, 74 evidence, 74 decisions
- Publishable ratings/indexes remain 0/0.

Run the preflight read-only. Only after a separate authorization may the exact checksummed installer run in one transaction. Then run the postflight read-only. Rating publication, index approval/publication, RPC changes and website deployment are separate actions.
