type Props = {
  fileName: string
  rowCount: number
  columnCount: number
}

export default function ImportSummary({
  fileName,
  rowCount,
  columnCount,
}: Props) {
  return (
    <div className="grid gap-5 md:grid-cols-3">
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
          Data Rows
        </p>

        <p className="mt-2 text-3xl font-bold">
          {rowCount}
        </p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <p className="text-sm uppercase tracking-wide text-zinc-500">
          Columns
        </p>

        <p className="mt-2 text-3xl font-bold">
          {columnCount}
        </p>
      </div>
    </div>
  )
}