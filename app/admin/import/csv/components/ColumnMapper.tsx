type Mapping = {
  requiredField: string
  selectedColumn: string
}

type Props = {
  csvHeaders: string[]
  requiredFields: string[]
  mappings: Mapping[]
  onChange: (
    requiredField: string,
    selectedColumn: string
  ) => void
}

export default function ColumnMapper({
  csvHeaders,
  requiredFields,
  mappings,
  onChange,
}: Props) {
  return (
    <div className="space-y-4">

      <h2 className="text-2xl font-bold">
        Column Mapping
      </h2>

      <p className="text-zinc-400">
        Match each required field to the correct CSV column.
      </p>

      {requiredFields.map((field) => {

        const current =
          mappings.find(
            (m) => m.requiredField === field
          )?.selectedColumn ?? ""

        return (

          <div
            key={field}
            className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-4"
          >

            <div className="font-semibold">
              {field}
            </div>

            <select
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
              value={current}
              onChange={(e) =>
                onChange(field, e.target.value)
              }
            >

              <option value="">
                -- Select Column --
              </option>

              {csvHeaders.map((header) => (
                <option
                  key={header}
                  value={header}
                >
                  {header}
                </option>
              ))}

            </select>

          </div>

        )

      })}

    </div>
  )
}