type DetectedColumn = {
  purpose: string
  column: string | null
  confidence: number
}

type Props = {
  detectedColumns: DetectedColumn[]
}

export default function ColumnDetection({
  detectedColumns,
}: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {detectedColumns.map((item) => (
        <div
          key={item.purpose}
          className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
        >
          <p className="capitalize text-zinc-400">
            {item.purpose.replaceAll("_", " ")}
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
  )
}