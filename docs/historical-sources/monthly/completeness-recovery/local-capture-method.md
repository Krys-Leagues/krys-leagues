# Local Monthlies evidence capture

On 2026-09-05, the public APEX Monthly page was captured with the preinstalled Microsoft Edge headless browser through a local CDP session. The browser followed the site's rendered Previous links in a session-preserving newest-to-oldest sequence, then requested each selected division with `P1_LEAGUE_ID`.

For each of the six retired cells and ten previously omitted visible cells, the capture saved rendered DOM HTML, `document.body.innerText`, structured leader/course JSON, and a full-page CDP screenshot under `raw/`. `local-capture-inventory.tsv` records request URLs and counts; `recovered-observations.tsv` contains every captured course observation; `evidence-sha256.tsv` contains SHA-256 hashes for every per-cell artifact.

These are rendered-DOM/browser captures, not claims of raw HTTP response-body capture. The current capture found source-state differences from the earlier browser crawl: the six retired cells still contain 320 rows but now split 194 scored / 126 missing, and 2024 September Pro 3 now contains 152 rows instead of the earlier 9.
