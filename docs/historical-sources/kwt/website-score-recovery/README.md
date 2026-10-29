# Historical KWT website score recovery

This directory preserves a read-only extraction from the authoritative KWT results site. KR Thursday Night Racing seasons are excluded. The source result-table HTML is preserved under `raw/`, with one SHA-256 entry per season/week in `raw-response-manifest.json`. Importer-ready CSV files are grouped under `normalized/`.

Verified extraction: 11 seasons, 124 weeks, 7,179 player-week rows, 7,179 Easy observations, 7,177 Hard observations, 7,179 totals, and 213 unique historical names. The earliest recovered week is KWT4W01 and the latest is KWT14W04.

The existing Historical KWT parser accepted 7,177 rows, blocked two rows with missing Hard scores, and emitted four warnings for source rank `NEW` while preserving the raw rank. No duplicate rows, conflicting observations, incorrect totals, garbled names, or partial source variants were found.

Read-only identity preview against the live public Global Player and verified-alias tables found 202 exact candidates, 6 ambiguous candidates, and 5 missing candidates among score-row names. The public REST key was denied access to `player_identity_links` by RLS (`42501`), so canonical-link reconciliation remains in the authenticated review UI. The full player directory is not committed.

No KWT scores were applied, imported, or written to Production.
