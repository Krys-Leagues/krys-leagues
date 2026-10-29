# Historical Pro Google Sheets recovery evidence

Read-only preservation package from three authorized Google Sheets workbooks. Original workbooks were not modified.

Sources:
- PRO WEEK CURRENT — 1X8IM5qjBFTDyNgP8tl4eYBry9aFgK0cGj-B1sl2ddNI
- PAST PRO WEEKS — 1_8hrH2tnCCFGFOC5YbYwI8i4umZyZtAS7GZcoShDGeM
- past pro weeks 60+ — 1nD0G1Nyt1qm7e3_3UM6dRwHb6kRNaXnRX8pzygT1tJ4

Raw exports are lossless connector responses with form-feed page separators. The normalized CSV is evidence/parser-ready only; no importer, identity matching, SQL, Production write, or deployment was performed.

Coverage: completed Seasons 1-12; weekly periods 1-137 except 43, 81, 94, 100, and 108. Season 13 is CURRENT / INCOMPLETE / NOT IMPORTABLE. Format eras are Weeks 1-5, Weeks 6-47, Weeks 48-76, Weeks 75-137/current workbook, and Seasons 1-12 wide paired scorecards. Left-side entered results and right-side published standings are retained; rank was not recalculated. The Season 1-12 row-level opponent artifact is preserved in `historical-pro-season-pairings.csv`; it uses only matching effective/user-entered font colors from the left-side Easy/Hard score-entry cells within each game. Exact color pairings are classified as played, scheduled/unplayed, or partial; unmatched color records remain ambiguous/unpaired. Week evidence remains separate and Week 107 variants are excluded from the normalized import-ready CSV pending Krys review.
