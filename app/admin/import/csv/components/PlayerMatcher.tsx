export type PlayerMatch = {
  importedName: string
  matchedName: string | null
  confidence: number
  status: "exact" | "close" | "new"
}

type Props = {
  matches: PlayerMatch[]
}

export default function PlayerMatcher({
  matches,
}: Props) {
  return (
    <div className="space-y-4">

      <h2 className="text-2xl font-bold">
        Player Matching
      </h2>

      <p className="text-zinc-400">
        Review each imported player before the data is imported.
      </p>

      {matches.map((match) => (

        <div
          key={match.importedName}
          className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"
        >

          <div className="flex items-center justify-between">

            <div>

              <div className="font-bold text-lg">
                {match.importedName}
              </div>

              {match.status === "exact" && (
                <div className="text-green-400 mt-2">
                  🟢 {match.matchedName}
                </div>
              )}

              {match.status === "close" && (
                <div className="text-yellow-400 mt-2">
                  🟡 {match.matchedName}
                </div>
              )}

              {match.status === "new" && (
                <div className="text-red-400 mt-2">
                  🔴 No Match Found
                </div>
              )}

            </div>

            <div className="text-right">

              <div className="text-sm text-zinc-400">
                Confidence
              </div>

              <div className="text-2xl font-bold">
                {match.confidence}%
              </div>

            </div>

          </div>

        </div>

      ))}

    </div>
  )
}