export type ImportType =
  | "stroke"
  | "match"
  | "pyp"
  | "doubles"
  | "monthly"
  | "kwt"
  | "tournament"
  | "course_records"
  | "other"

export type ImportTypeOption = {
  value: ImportType
  label: string
  description: string
  icon: string
  expectedColumns: string[]
}

type Props = {
  options: ImportTypeOption[]
  selected: ImportType | null
  onSelect: (value: ImportType) => void
}

export default function ImportTypeSelector({
  options,
  selected,
  onSelect,
}: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {options.map((option) => {
        const isSelected = selected === option.value

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            className={`rounded-xl border p-5 text-left transition ${
              isSelected
                ? "border-indigo-400 bg-indigo-900/60 ring-2 ring-indigo-400"
                : "border-zinc-700 bg-zinc-950 hover:border-zinc-500"
            }`}
          >
            <div className="flex items-start gap-4">
              <span className="text-3xl">
                {option.icon}
              </span>

              <div>
                <h3 className="text-xl font-bold">
                  {option.label}
                </h3>

                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  {option.description}
                </p>
              </div>
            </div>

            {option.expectedColumns.length > 0 && (
              <div className="mt-4 border-t border-zinc-800 pt-4">
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                  Typical Columns
                </p>

                <p className="mt-2 text-sm text-zinc-400">
                  {option.expectedColumns.join(", ")}
                </p>
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}