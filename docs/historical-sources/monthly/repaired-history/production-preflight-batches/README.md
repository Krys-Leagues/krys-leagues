# Monthlies production preflight batch run order

These files are SELECT-only read-only preflight queries. Do not run the migration or import from their results. Each batch contains one finalized period, and periods do not overlap. Each embedded observation has a unique payload_row ordinal; the original source_row provenance value is preserved unchanged and may repeat across source files. Run the files in order and sum the SUMMARY counts across batches. PRODUCTION_ONLY is scoped to each batch period.

Source payload: 19,015 numeric played observations (139 zero, 18,172 negative, 704 positive). September 2026 is intentionally absent; August 2026 is batch 25.

## Ordered files

01. monthly-production-preflight-batch-01-period-54.sql - 2024 August - 713 source rows - 322651 bytes - SHA-256 8B9295BDC0F1E3B7AB145B15D926583686351EDE4AE7C1473C83BAB5C5DE2135
02. monthly-production-preflight-batch-02-period-55.sql - 2024 September - 854 source rows - 376757 bytes - SHA-256 445160059115754244600F653337A876C9BA6DF832F2137F7D395532588E7554
03. monthly-production-preflight-batch-03-period-56.sql - 2024 October - 684 source rows - 302346 bytes - SHA-256 12832533841B7404934FA03B8378AFCF3F97AD4DCDAA5B9CD08B7DEFBF4A969F
04. monthly-production-preflight-batch-04-period-57.sql - 2024 November - 726 source rows - 319822 bytes - SHA-256 0DD3FEAD71FB6C91840A0E44C87778474768DB5F117B559A3925430987A5CE0E
05. monthly-production-preflight-batch-05-period-58.sql - 2024 December - 700 source rows - 308466 bytes - SHA-256 8AE408121159D22DD610ECCCBFFCE553B2009AE686EBAFD9047928A335A3FAAC
06. monthly-production-preflight-batch-06-period-81.sql - 2025 January - 885 source rows - 392144 bytes - SHA-256 8062745ECED4BEAF9A684BBF96067061A8A7ECE25C47E60963923931B6EE3A75
07. monthly-production-preflight-batch-07-period-101.sql - 2025 February - 613 source rows - 272049 bytes - SHA-256 B4A62AD00F16A39045C46B8D271D24798DAA73A6CEE3CDA65D175CFDEFE1FEE0
08. monthly-production-preflight-batch-08-period-121.sql - 2025 March - 757 source rows - 340429 bytes - SHA-256 56CA63474BF30E00AE4F216EA3911A0E848DC35D18EB4864A230ADCD4C2FCCBC
09. monthly-production-preflight-batch-09-period-141.sql - 2025 April - 864 source rows - 377672 bytes - SHA-256 19B392358555D97B1BAF54ABAD5DF59AB5DD8FEFB5B79F731E7B2CCFD8C3E661
10. monthly-production-preflight-batch-10-period-161.sql - 2025 May - 875 source rows - 379944 bytes - SHA-256 6B38E6A5CA73EA6C22CE097B356B546921001C7D3C3973ECB327C3970C5C273D
11. monthly-production-preflight-batch-11-period-181.sql - 2025 June - 892 source rows - 388020 bytes - SHA-256 E566BEC48F6C064AA298FF439EE90456414A9AB214DDD5FE132ECAC65BC84FBB
12. monthly-production-preflight-batch-12-period-201.sql - 2025 July - 896 source rows - 397473 bytes - SHA-256 0617B931A462EADB71A38CE8A926226A5CE1248513F304FDAF8C4BAF1E50E697
13. monthly-production-preflight-batch-13-period-221.sql - 2025 August - 886 source rows - 381364 bytes - SHA-256 8790ED72F1472D4BBFF2418C354D7EEAF7ECEF66239036519FF82812C8995D24
14. monthly-production-preflight-batch-14-period-241.sql - 2025 September - 846 source rows - 374704 bytes - SHA-256 B8BB9F614BB845E213FD4D68CA3C4E9EA7FA3028924B67611E1FB7462A8AABF5
15. monthly-production-preflight-batch-15-period-261.sql - 2025 October - 883 source rows - 390230 bytes - SHA-256 86ED7B45284639BA2E174302D1CE354EDADA9F5765D98D8244A6FE05518EF629
16. monthly-production-preflight-batch-16-period-281.sql - 2025 November - 832 source rows - 376617 bytes - SHA-256 62549BD7269BFE895CE9E92D41DBA841EB5F344B56E53BD9C4105C2443980F9E
17. monthly-production-preflight-batch-17-period-301.sql - 2025 December - 786 source rows - 342384 bytes - SHA-256 7A1A1C19C777592D2FB7557B348765A8BC482B7AFDD1F2E6BE84D22D3D4002FC
18. monthly-production-preflight-batch-18-period-321.sql - 2026 January - 816 source rows - 371821 bytes - SHA-256 B839461E3EC62E2EE137526D0B298905BEABE947854CD2130F3EA71B3AF536E1
19. monthly-production-preflight-batch-19-period-341.sql - 2026 February - 739 source rows - 327558 bytes - SHA-256 A528D81FAEBB5EE6EC38888423D1DAE859C442114682783563DDBF023043377A
20. monthly-production-preflight-batch-20-period-361.sql - 2026 March - 806 source rows - 354129 bytes - SHA-256 6AE5B4FC00D16E3ACFF8DD021B15894847EF52F82ABA25EA7CA38CBA0C75AA9E
21. monthly-production-preflight-batch-21-period-381.sql - 2026 April - 739 source rows - 323689 bytes - SHA-256 09A6CFEDF1231A61300A7E9975A48ACE4601D7F4F8044F32BAB95DE60C4D55AC
22. monthly-production-preflight-batch-22-period-401.sql - 2026 May - 637 source rows - 278001 bytes - SHA-256 1531C237F5C2AE1EF50F05DC91BFA021814C3662D002670CE632C747E1454E0C
23. monthly-production-preflight-batch-23-period-421.sql - 2026 June - 575 source rows - 258459 bytes - SHA-256 CB7E94E8314BE70E9D069FB6D8527DA1A95EDCAD1B661CAB5EA4C8B057A7B7CA
24. monthly-production-preflight-batch-24-period-441.sql - 2026 July - 639 source rows - 283493 bytes - SHA-256 3E55D98C1B6434D24A96504A2BF47396142284F693D1FECAABB7B0F1DED4F210
25. monthly-production-preflight-batch-25-period-461.sql - 2026 August - 372 source rows - 166010 bytes - SHA-256 3D100C80BC899FEBAA1A21B7C3EF8FA1938BE28552522DDFE56314005E6BD3F9

## Manual procedure

1. Open the normal Production Supabase SQL Editor.
2. Run each SQL file above, in order, as a separate query.
3. Save each SUMMARY, ROW_CLASSIFICATION, CONFLICT_DETAIL, and PRODUCTION_ONLY result.
4. Sum the per-batch SUMMARY counts only after all batches finish.
5. Stop for review if any TRUE_CONFLICT appears.
6. Do not execute migration or import SQL from this preflight review.
