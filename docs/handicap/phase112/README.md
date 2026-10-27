# Phase 112 official KWT CSV candidate

This is a local, append-only import candidate. It is not applied to Production.

The source exports do not contain authoritative numeric KWT player IDs or round IDs. The package therefore uses a separately named `OFFICIAL_KWT_CSV` evidence namespace embedded in the existing five-part KWT fingerprint contract. Its participant and round keys are deterministic hashes of the exact source files, rows, names, scores, and Season/Week evidence; they are explicitly **not** claimed to be KWT numeric IDs.

- Resolved pair rows: **324**
- Quarantined unresolved pair rows: **47**
- Course observations in candidate: **648**
- Quarantined course observations: **94**
- Weekly evidence: not included
- Production writes: none

Before any Production use, this namespace requires a separately reviewed compatibility decision against the installed publication gate and historical importer.
