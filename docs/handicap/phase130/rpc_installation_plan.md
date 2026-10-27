# Phase 130 RPC installation plan

Target: Supabase `jfbndcwdsvsjgnzwvexp`.

SQL: `supabase/proposals/20261022_handicap_rolling20_player_read_rpc.proposed.sql`.

SHA-256: `9C8A82108B1B6B4154F7E03B5A8DCF8E6DC3C6E7B6C452247D6A4BDC2E36D003`.

Preflight must confirm the Phase127 rolling-20 columns and guarded security-invoker publication view exist, the function is absent, and no client table/view SELECT privileges exist. Execute only the checksummed proposal in one transaction. Postflight must confirm the function exists with `SECURITY DEFINER`, empty `search_path`, no `PUBLIC`/`anon` execute, `authenticated` execute only, and an authenticated caller can read only the canonical identity-bound result. No publication or data import is part of this step.
