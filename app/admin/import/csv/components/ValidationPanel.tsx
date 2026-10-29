export type ValidationItem = {
  message: string
  level: "success" | "warning" | "error"
}

type Props = {
  items: ValidationItem[]
}

export default function ValidationPanel({
  items,
}: Props) {
  return (
    <div className="space-y-4">

      <h2 className="text-2xl font-bold">
        Import Validation
      </h2>

      <p className="text-zinc-400">
        Review all warnings before importing.
      </p>

      {items.length === 0 && (
        <div className="rounded-xl border border-green-700 bg-green-950 p-4">
          <div className="font-bold text-green-300">
            ✅ No validation issues found.
          </div>
        </div>
      )}

      {items.map((item, index) => {

        const color =
          item.level === "success"
            ? "border-green-700 bg-green-950 text-green-300"
            : item.level === "warning"
            ? "border-yellow-700 bg-yellow-950 text-yellow-300"
            : "border-red-700 bg-red-950 text-red-300"

        const icon =
          item.level === "success"
            ? "✅"
            : item.level === "warning"
            ? "⚠️"
            : "❌"

        return (

          <div
            key={index}
            className={`rounded-xl border p-4 ${color}`}
          >
            <div className="font-semibold">
              {icon} {item.message}
            </div>
          </div>

        )

      })}

    </div>
  )
}