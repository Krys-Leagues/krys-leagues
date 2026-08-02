"use client";

import Link from "next/link";
import { ChangeEvent, DragEvent, useMemo, useState } from "react";

type CsvRow = Record<string, string>;

type DetectedColumn = {
  purpose: string;
  column: string | null;
  confidence: number;
};

const COLUMN_PATTERNS = {
  player: [
    "player",
    "player name",
    "name",
    "screen name",
    "screen_name",
    "walkabout name",
    "walkabout_name",
    "username",
  ],
  division: [
    "division",
    "div",
    "tier",
    "group",
    "flight",
  ],
  season: [
    "season",
    "season number",
    "season_number",
  ],
  score: [
    "score",
    "total score",
    "total_score",
    "strokes",
    "stroke total",
    "stroke_total",
  ],
  points: [
    "points",
    "pts",
    "season points",
    "season_points",
  ],
  placement: [
    "placement",
    "place",
    "position",
    "rank",
    "finish",
  ],
  course: [
    "course",
    "course name",
    "course_name",
    "map",
  ],
  date: [
    "date",
    "played date",
    "played_date",
    "match date",
    "match_date",
  ],
};

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = "";
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"') {
      if (insideQuotes && nextCharacter === '"') {
        currentValue += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }

      continue;
    }

    if (character === "," && !insideQuotes) {
      currentRow.push(currentValue.trim());
      currentValue = "";
      continue;
    }

    if (
      (character === "\n" || character === "\r") &&
      !insideQuotes
    ) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      currentRow.push(currentValue.trim());

      const hasContent = currentRow.some(
        (value) => value.trim() !== ""
      );

      if (hasContent) {
        rows.push(currentRow);
      }

      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += character;
  }

  currentRow.push(currentValue.trim());

  if (currentRow.some((value) => value.trim() !== "")) {
    rows.push(currentRow);
  }

  return rows;
}

function findDetectedColumn(
  headers: string[],
  patterns: string[]
): {
  column: string | null;
  confidence: number;
} {
  const normalizedHeaders = headers.map((header) => ({
    original: header,
    normalized: normalizeHeader(header),
  }));

  for (const pattern of patterns) {
    const exactMatch = normalizedHeaders.find(
      (header) => header.normalized === pattern
    );

    if (exactMatch) {
      return {
        column: exactMatch.original,
        confidence: 100,
      };
    }
  }

  for (const pattern of patterns) {
    const partialMatch = normalizedHeaders.find(
      (header) =>
        header.normalized.includes(pattern) ||
        pattern.includes(header.normalized)
    );

    if (partialMatch) {
      return {
        column: partialMatch.original,
        confidence: 80,
      };
    }
  }

  return {
    column: null,
    confidence: 0,
  };
}

function createRows(
  headers: string[],
  values: string[][]
): CsvRow[] {
  return values.map((row) => {
    const result: CsvRow = {};

    headers.forEach((header, index) => {
      result[header] = row[index] ?? "";
    });

    return result;
  });
}

export default function CsvImportPage() {
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const detectedColumns = useMemo<DetectedColumn[]>(() => {
    if (headers.length === 0) {
      return [];
    }

    return Object.entries(COLUMN_PATTERNS).map(
      ([purpose, patterns]) => {
        const result = findDetectedColumn(
          headers,
          patterns
        );

        return {
          purpose,
          column: result.column,
          confidence: result.confidence,
        };
      }
    );
  }, [headers]);

  async function analyzeFile(file: File) {
    setError("");
    setFileName("");
    setHeaders([]);
    setRows([]);

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Please select a CSV file.");
      return;
    }

    try {
      const text = await file.text();
      const parsedRows = parseCsv(text);

      if (parsedRows.length < 2) {
        setError(
          "The CSV must contain a header row and at least one data row."
        );
        return;
      }

      const parsedHeaders = parsedRows[0].map(
        (header, index) =>
          header.trim() || `Column ${index + 1}`
      );

      const dataRows = createRows(
        parsedHeaders,
        parsedRows.slice(1)
      );

      setFileName(file.name);
      setHeaders(parsedHeaders);
      setRows(dataRows);
    } catch (fileError) {
      console.error(fileError);

      setError(
        "The CSV could not be read. No data was imported."
      );
    }
  }

  function handleFileChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (file) {
      void analyzeFile(file);
    }

    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);

    const file = event.dataTransfer.files?.[0];

    if (file) {
      void analyzeFile(file);
    }
  }

  function clearFile() {
    setFileName("");
    setHeaders([]);
    setRows([]);
    setError("");
  }

  const previewRows = rows.slice(0, 10);

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-indigo-400">
              Data Import Center
            </p>

            <h1 className="text-4xl font-bold">
              League CSV Analyzer
            </h1>

            <p className="mt-3 max-w-3xl text-zinc-400">
              Upload a CSV to inspect its columns and data.
              Nothing will be saved to Supabase during this
              step.
            </p>
          </div>

          <Link
            href="/admin/import"
            className="rounded-lg border border-zinc-700 px-5 py-3 font-semibold text-zinc-200 transition hover:bg-zinc-800"
          >
            ← Import Center
          </Link>
        </div>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`rounded-xl border-2 border-dashed p-10 text-center transition ${
              isDragging
                ? "border-indigo-400 bg-indigo-950/40"
                : "border-zinc-700 bg-zinc-950"
            }`}
          >
            <div className="text-5xl">📄</div>

            <h2 className="mt-4 text-2xl font-bold">
              Drop a CSV file here
            </h2>

            <p className="mt-2 text-zinc-400">
              Or choose a file from your computer.
            </p>

            <label className="mt-6 inline-flex cursor-pointer rounded-lg bg-indigo-600 px-6 py-3 font-semibold transition hover:bg-indigo-500">
              Choose CSV
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>

          {error && (
            <div className="mt-5 rounded-lg border border-red-800 bg-red-950 p-4 text-red-200">
              ❌ {error}
            </div>
          )}
        </section>

        {fileName && (
          <>
            <section className="mt-8 grid gap-5 md:grid-cols-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
                <p className="text-sm uppercase tracking-wide text-zinc-500">
                  File
                </p>

                <p className="mt-2 break-all text-lg font-bold">
                  {fileName}
                </p>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
                <p className="text-sm uppercase tracking-wide text-zinc-500">
                  Data rows
                </p>

                <p className="mt-2 text-3xl font-bold">
                  {rows.length}
                </p>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
                <p className="text-sm uppercase tracking-wide text-zinc-500">
                  Columns
                </p>

                <p className="mt-2 text-3xl font-bold">
                  {headers.length}
                </p>
              </div>
            </section>

            <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold">
                    Automatic Column Detection
                  </h2>

                  <p className="mt-1 text-zinc-400">
                    These are suggestions only. You will confirm
                    the mappings before importing.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={clearFile}
                  className="rounded-lg border border-red-800 px-4 py-2 font-semibold text-red-300 transition hover:bg-red-950"
                >
                  Clear File
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {detectedColumns.map((item) => (
                  <div
                    key={item.purpose}
                    className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
                  >
                    <p className="capitalize text-zinc-400">
                      {item.purpose}
                    </p>

                    {item.column ? (
                      <>
                        <p className="mt-2 font-bold text-green-300">
                          ✅ {item.column}
                        </p>

                        <p className="mt-1 text-sm text-zinc-500">
                          Confidence: {item.confidence}%
                        </p>
                      </>
                    ) : (
                      <p className="mt-2 font-semibold text-yellow-300">
                        ⚠️ Not detected
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <h2 className="text-2xl font-bold">
                CSV Preview
              </h2>

              <p className="mt-1 text-zinc-400">
                Showing the first {previewRows.length} of{" "}
                {rows.length} data rows.
              </p>

              <div className="mt-5 overflow-x-auto rounded-xl border border-zinc-800">
                <table className="min-w-full divide-y divide-zinc-800">
                  <thead className="bg-zinc-950">
                    <tr>
                      <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-zinc-400">
                        Row
                      </th>

                      {headers.map((header) => (
                        <th
                          key={header}
                          className="whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-zinc-300"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-zinc-800">
                    {previewRows.map((row, rowIndex) => (
                      <tr
                        key={rowIndex}
                        className="bg-zinc-900 hover:bg-zinc-800/70"
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-500">
                          {rowIndex + 1}
                        </td>

                        {headers.map((header) => (
                          <td
                            key={`${rowIndex}-${header}`}
                            className="max-w-xs whitespace-nowrap px-4 py-3 text-sm text-zinc-200"
                          >
                            {row[header] || (
                              <span className="text-zinc-600">
                                —
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-8 rounded-2xl border border-yellow-800 bg-yellow-950/40 p-6">
              <h2 className="text-xl font-bold text-yellow-200">
                Preview mode only
              </h2>

              <p className="mt-2 text-yellow-100/80">
                This page has not added an import batch, changed
                a player, or saved any CSV records. The next step
                will let you confirm which column contains the
                player names.
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}