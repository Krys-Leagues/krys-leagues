import { readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { parseHistoricalKwtRows } from "../lib/importer/adapters/kwtAdapter.ts"

const directory = path.resolve(process.argv[2] || "docs/historical-sources/kwt/website-score-recovery/normalized")
const reportPath = process.argv[3] ? path.resolve(process.argv[3]) : null
const parseCsv = (text) => {
  const records = []
  let field = ""
  let row = []
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted && char === '"' && text[index + 1] === '"') { field += '"'; index += 1; continue }
    if (char === '"') { quoted = !quoted; continue }
    if (!quoted && char === ",") { row.push(field); field = ""; continue }
    if (!quoted && char === "\n") { row.push(field.replace(/\r$/, "")); records.push(row); row = []; field = ""; continue }
    field += char
  }
  if (field || row.length) { row.push(field); records.push(row) }
  const headers = records.shift() || []
  return records.filter((values) => values.some((value) => value !== "")).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])))
}

const files = (await readdir(directory)).filter((file) => /^KWT\d+W\d+\.csv$/i.test(file)).sort()
let parsedRows = 0
let parserErrors = []
let parserWarnings = []
let duplicates = 0
for (const file of files) {
  const result = parseHistoricalKwtRows(parseCsv(await readFile(path.join(directory, file), "utf8")), file)
  parsedRows += result.rows.length
  parserErrors = parserErrors.concat(result.errors)
  parserWarnings = parserWarnings.concat(result.warnings)
  duplicates += result.duplicateRows
}
const report = { normalizedFiles: files.length, parsedRows, parserErrors: parserErrors.length, parserWarnings: parserWarnings.length, duplicateRows: duplicates, errors: parserErrors, warnings: parserWarnings }
if (reportPath) await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n")
console.log(JSON.stringify(report, null, 2))
if (files.length !== 124 || parsedRows !== 7177 || parserErrors.length !== 2 || parserWarnings.length !== 4 || duplicates !== 0) process.exitCode = 1
