# Targeted conflict reproduction evidence

Capture date: 2026-09-07 (America/New_York)

These are three independent fresh HTTP/APEX public-source sessions. Each session started at the public Monthly home, followed the Previous-period navigation to period 221 (2025 August), obtained a new APEX session, and requested the read-only Elite view with `P1_LEAGUE_ID=22`. No headed browser state, credentials, cookies, or tokens were saved.

| repetition | period ID | division ID | course tables | target player ID | target score | HTML SHA-256 | text SHA-256 |
|---:|---:|---:|---:|---:|---:|---|---|
| 1 | 221 | 22 | 8 | 8108 | -26 | 84A08C9A6A51D2C3CFBDF5AAB6750DD20F1EF8EF357ED0735134CA6B01B555E3 | 14BCD7F56FEE78D309A88ED9CAD2A3AFBC4B7E96258C3B36EFE516EE52656878 |
| 2 | 221 | 22 | 8 | 8108 | -26 | 908F8F00183F385231CFAE6CC948136861B3E827A06B1DB102D4FD35C3BC773E | 14BCD7F56FEE78D309A88ED9CAD2A3AFBC4B7E96258C3B36EFE516EE52656878 |
| 3 | 221 | 22 | 8 | 8108 | -26 | A06165FA115035F473DEE2BC2398C29BEF7D5650E26CECA643DAA14C508FA601 | 14BCD7F56FEE78D309A88ED9CAD2A3AFBC4B7E96258C3B36EFE516EE52656878 |

The HTML hashes differ because each response contains session-specific markup. The extracted course-table text hashes match. The preserved durable capture from the earlier crawl recorded Atlantis `-23` for the same period/division/player/course. The old retained CSV recorded a blank/unplayed Atlantis cell. Therefore the current repeated snapshot is reproducible at `-26`, while the historical discrepancy is a substantive source change requiring review; neither prior source is overwritten.
