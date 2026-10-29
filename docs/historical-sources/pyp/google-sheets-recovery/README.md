# Historical PYP source recovery

Source: PYP native Google Sheet
Spreadsheet ID: 1l-FgF1TiEp2oVGihLZlb2SHJTB6mioEcuB6hxGDGbzw
URL: https://docs.google.com/spreadsheets/d/1l-FgF1TiEp2oVGihLZlb2SHJTB6mioEcuB6hxGDGbzw/edit

## Scope

Historical tabs S1-S14 are included. Season 15 appears in `Current divisions` and `Current COURSE MASTER` and is current/excluded from historical recovery.

## Reproduced source counts

- Exact historical names: 79 (BYE excluded)
- Participant-season/division records: 265
- Player-game slots: 795
- Numeric result slots: 597
- Explicit blank/dash unplayed slots: 198 (161 dash, 37 blank)
- Numeric 0/0 slots classified as unplayed: 37
- Total normalized unplayed slots: 235
- Total normalized played slots: 560
- Numeric 0/0 slots with W/L/D evidence: 2
- Mirrored placement discrepancies resolved by the right-side rule: 184
- Normalized rows include standings points from the authoritative right-side block.

## Format eras

- Seasons 1-2: aggregate layout with per-game Total and W/L/D; no C1/C2 detail.
- Seasons 3-14: detailed layout with per-game Total, C1, C2, and W/L/D. C1/C2 are holes won.

## Important source limitations

- The historical season tabs do not contain course/map names.
- Opponents are not consistently present. The separate opponent artifact records only explicit `VS` cells found in the historical COURSE MASTER tab.
- Score-cell formatting/font colors are preserved but are not interpreted as pairing evidence.
- The left/right standings are mirrored displays. Score/stat values matched in the mirrored representations, but placement labels can differ. The normalized artifact uses the right-side formula-sorted placement as the published/final rank; the left-side value remains preserved in the rank-conflict artifact.
- Numeric 0 is preserved exactly. The 37 numeric 0/0 cases without game-level W/L/D evidence are classified as unplayed, while the two source-proven played zero cases remain played numeric zero.
- Blank and dash tokens remain distinct.
- `sc`, `11sc`, and `5 sc` contain only sparse control/template values and were not treated as historical results.

## Files

- `historical-pyp-raw-values.json`: raw values for S1-S14.
- `historical-pyp-score-formatting.json`: score-entry formatting and font-color evidence.
- `historical-pyp-normalized.csv`: parser-ready player-game rows.
- `historical-pyp-zero-review.csv`: 37 numeric 0/0 cases preserved as an audit trail for the unplayed classification.
- `historical-pyp-rank-conflicts.csv`: 184 mirrored placement conflicts.
- `historical-pyp-opponent-evidence.csv`: explicit VS evidence only.
- `tab-inventory.json`: workbook tab metadata.
- `source-manifest.json`: source and artifact manifest.

## Review/import preparation

- Unknown or unusable opponent evidence is preserved as nonblocking evidence; it is not a manual review queue.
- Only multiple plausible opponent candidates create an actionable pairing review.
- The preview parser version is `historical-pyp-review-v2-nonblocking-unknown-opponents`, so older local drafts are ignored.
- Manual Global Player selections use the existing shared verified-alias memory RPC and retain the exact historical name.
- Final commit preparation is implemented through `historical_pyp_import_foundation.sql`; it is additive, idempotent, site-admin protected, and has not been run from this worktree.
