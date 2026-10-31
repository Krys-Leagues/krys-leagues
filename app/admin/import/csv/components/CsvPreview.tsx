type CsvRow = Record<string, string>

type Props = {
  headers: string[]
  rows: CsvRow[]
}

export default function CsvPreview({
  headers,
  rows,
}: Props) {
  const previewRows = rows.slice(0, 10)

  return (
    <>
      <h2 className="text-2xl font-bold">
        CSV Preview
      </h2>

      <p className="mt-1 text-zinc-400">
        Showing the first {previewRows.length} of {rows.length} data rows.
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
    </>
  )
}