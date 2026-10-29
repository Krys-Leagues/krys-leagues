# CURRENT SPRINT

## Sprint Goal

Finish the Universal Import Center and connect it to the new Player Identity System.

---

# COMPLETED

## Player Identity

✅ Created Identity Engine

✅ normalizeIdentity()

✅ scoreIdentityMatch()

✅ resolveIdentity()

✅ Alias loading

---

## Import Backend

✅ createImportBatch()

✅ saveImportRows()

✅ loadPlayers()

✅ loadPlayerAliases()

✅ matchPlayers()

✅ validateImport()

✅ runImport()

---

## CSV Import Investigation

Today we inspected the existing Import Center and discovered it already contains completed UI components.

Confirmed complete:

✅ UploadArea

✅ ImportSummary

✅ ImportTypeSelector

✅ ColumnDetection

✅ ColumnMapper

✅ PlayerMatcher

✅ ValidationPanel

✅ CsvPreview

---

# CURRENT TASK

Convert `app/admin/import/csv/page.tsx` into the workflow controller that connects the existing components.

The page should orchestrate:

Upload
↓
Import Summary
↓
Import Type
↓
Column Detection
↓
Column Mapping
↓
Player Matching
↓
Validation
↓
CSV Preview
↓
runImport()

---

# NEXT TASKS

□ Wire ColumnMapper into page.tsx

□ Wire PlayerMatcher into page.tsx

□ Wire ValidationPanel into page.tsx

□ Connect runImport()

□ Test first Stroke CSV

□ Test Match CSV

□ Test PYP CSV

□ Test Doubles CSV

□ Test KWT CSV

---

# NOTES

The UI components already existed.

The backend already existed.

The remaining work is connecting the workflow.