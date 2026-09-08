# Targeted Monthly rendered-DOM evidence

Each `period-*-division-*` set contains:

- `.html`: rendered DOM captured from the public APEX page
- `.txt`: exact `document.body.innerText`
- `.json`: structured leader and course-row extraction
- `.png`: full-page screenshot captured through CDP

These are rendered-DOM/browser captures, not claims of raw HTTP response-body
capture. `evidence-sha256.tsv` contains SHA-256 values for every per-cell file.
The six retired values (`114` and `115`) and the ten previously omitted visible
cells are represented. The source repair gate remains subject to review of the
live-source state conflicts documented by `row-level-diff.json`.
