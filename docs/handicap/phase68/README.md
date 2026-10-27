# Phase 68 provenance recovery package

This package is local-only and has not been applied to Production.

The Phase 67 defect was caused by an unsafe dictionary encoder: repeated values were assigned their original input position while the dictionary stored only unique values. The corrected encoder assigns each first occurrence a one-based dictionary index and reuses that index for all repeats.

- Superseded invalid run: 5a57560c-3548-54a8-879c-8fc516a85f26
- Corrected DRAFT run: fb606c55-e2f6-5d01-b79d-bfcc129a7cc6
- KWT rows: **13550**, all with canonical UUID and source-player metadata
- Weekly rows: **844**, all external and personal-handicap-ineligible
- Rating snapshots: **169**, all UNPUBLISHED; 158 ready classification and 11 provisional classification
- Effective dates: none invented; all remain NULL

The invalid Phase 67 batch must remain immutable. A future authorized recovery must append a quarantine evidence/decision record for the invalid run, then append the corrected DRAFT run, provenance, and snapshots in one transaction. This package contains no Production SQL and no cleanup operation.
