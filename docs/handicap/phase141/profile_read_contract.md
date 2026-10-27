# Public Handicap profile read contract

Proposed RPC: `public.get_public_published_handicap_for_player(uuid)`.

The wrapper is callable by anonymous and authenticated clients, but returns only rows admitted by the existing publishable-index view. It returns canonical player ID, current screen name, signed numeric index, golf display notation, status, card count, model version, effective date, published timestamp, and safe publication history. It never returns source-round IDs, rating IDs, provenance, review evidence, or private fields. The existing identity-bound `public.get_published_handicap_for_player(uuid)` remains unchanged for self-only reads. No direct table or view SELECT grants are added. Installation is a separate authorization.
