# Phase 109 — Named Handicap Review

This phase keeps the Phase 105 unpublished index snapshots unchanged and adds a
protected, read-only review path for the site-admin surface.

The review loader reads the committed Phase 104 package, verifies that the
unpublished Production snapshot set has the same 157 snapshot IDs, and resolves
each canonical UUID through `public.players.screen_name`. The existing
`player_identity_links` chain is checked so a non-root identity cannot be
presented as canonical. Names are read server-side with the admin data client
only after the existing site-admin authorization succeeds.

The review table is not exposed through the public player route or the existing
review API. It includes the stored signed index, golf notation, qualifying-round
counts, latest-10/best-5 counts, rating references, chronology, and review flags.
URL query parameters provide deterministic admin-only filtering and sorting; no
approval or publication mutation is exposed.

The source package remains a review input only. A missing Production snapshot,
canonical player, or exact screen name fails closed and shows no candidate rows.
