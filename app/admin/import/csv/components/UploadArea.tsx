type UploadAreaProps = {
  isDragging: boolean
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void
  onDragLeave: () => void
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void
}

export default function UploadArea({
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileChange,
}: UploadAreaProps) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
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
          onChange={onFileChange}
          className="hidden"
        />
      </label>
    </div>
  )
}