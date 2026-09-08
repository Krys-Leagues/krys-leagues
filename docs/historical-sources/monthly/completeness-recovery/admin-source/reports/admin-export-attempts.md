# Read-only admin export attempts

Capture date: 2026-09-07

The APEX Interactive Grid Actions menu was inspected without enabling Edit and without using Save, Add Row, row actions, or any mutation control.

## Export formats exposed

For the Courses grid (`R27920066730650719_ig_toolbar`) the Download dialog exposed:

- CSV (selected default)
- HTML
- PDF
- Excel

For the Leagues grid (`R28011591147538931_ig_toolbar`) the Download dialog exposed the same four formats plus a `Strip Rich Text` option (left disabled).

The CSV download action was invoked once for each of those two grids. The application reported `Success Message — File prepared. Starting download.` for the Leagues export, and the Courses dialog closed after the download action. No export file appeared in the host Downloads directory available to this worktree, and the in-app browser did not expose a local download path. Consequently, no downloaded bytes, filename, field count, row count, or SHA-256 is claimed as preserved. The application-generated exports remain an unresolved acquisition item.

The Players grid could not be used for a historical export in the observed state because its parent period row was not selected; the child grid explicitly displayed `Select 1 row in the parent region`. No period radio was selected for this audit.
