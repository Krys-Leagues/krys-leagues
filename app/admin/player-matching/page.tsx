"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type Player = {
  id: string
  screen_name: string
  discord_id: string | null
}

type DiscordMember = {
  id: string
  discord_id: string
  discord_name: string
  player_id: string | null
}

type SuggestedMatch = {
  player: Player
  member: DiscordMember
  confidence: number
}

function normalizeName(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

function similarityScore(left: string, right: string) {
  const a = normalizeName(left)
  const b = normalizeName(right)

  if (!a || !b) return 0
  if (a === b) return 100

  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length)
    const longer = Math.max(a.length, b.length)

    return Math.round((shorter / longer) * 95)
  }

  let matches = 0
  const used = new Set<number>()

  for (const character of a) {
    const index = b
      .split("")
      .findIndex(
        (candidate, candidateIndex) =>
          candidate === character &&
          !used.has(candidateIndex)
      )

    if (index >= 0) {
      used.add(index)
      matches += 1
    }
  }

  return Math.round(
    (matches / Math.max(a.length, b.length)) * 80
  )
}

export default function PlayerMatchingPage() {
  const router = useRouter()

  const [players, setPlayers] = useState<Player[]>([])
  const [members, setMembers] = useState<DiscordMember[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [minimumConfidence, setMinimumConfidence] = useState(70)

  useEffect(() => {
    void loadData()
  }, [])

  async function loadData() {
    setLoading(true)

    const [
      { data: playerData, error: playerError },
      { data: memberData, error: memberError },
    ] = await Promise.all([
      supabase
        .from("players")
        .select("id, screen_name, discord_id")
        .is("discord_id", null)
        .order("screen_name"),

      supabase
        .from("discord_members")
        .select(
          "id, discord_id, discord_name, player_id"
        )
        .is("player_id", null)
        .order("discord_name"),
    ])

    setLoading(false)

    if (playerError) {
      alert(playerError.message)
      return
    }

    if (memberError) {
      alert(memberError.message)
      return
    }

    setPlayers(playerData || [])
    setMembers(memberData || [])
  }

  const suggestions = useMemo<SuggestedMatch[]>(() => {
    const results: SuggestedMatch[] = []

    for (const player of players) {
      let bestMember: DiscordMember | null = null
      let bestScore = 0

      for (const member of members) {
        const score = similarityScore(
          player.screen_name,
          member.discord_name
        )

        if (score > bestScore) {
          bestMember = member
          bestScore = score
        }
      }

      if (
        bestMember &&
        bestScore >= minimumConfidence
      ) {
        results.push({
          player,
          member: bestMember,
          confidence: bestScore,
        })
      }
    }

    return results.sort(
      (a, b) => b.confidence - a.confidence
    )
  }, [players, members, minimumConfidence])

  async function approveMatch(
    suggestion: SuggestedMatch
  ) {
    const confirmed = window.confirm(
      `Link player "${suggestion.player.screen_name}" to Discord member "${suggestion.member.discord_name}"?`
    )

    if (!confirmed) return

    setSavingId(suggestion.player.id)

    const { error: playerError } = await supabase
      .from("players")
      .update({
        discord_id: suggestion.member.discord_id,
        discord_name: suggestion.member.discord_name,
      })
      .eq("id", suggestion.player.id)
      .is("discord_id", null)

    if (playerError) {
      setSavingId(null)
      alert(playerError.message)
      return
    }

    const { error: memberError } = await supabase
      .from("discord_members")
      .update({
        player_id: suggestion.player.id,
        walkabout_name:
          suggestion.player.screen_name,
      })
      .eq("id", suggestion.member.id)
      .is("player_id", null)

    setSavingId(null)

    if (memberError) {
      alert(memberError.message)
      return
    }

    setPlayers((current) =>
      current.filter(
        (player) =>
          player.id !== suggestion.player.id
      )
    )

    setMembers((current) =>
      current.filter(
        (member) =>
          member.id !== suggestion.member.id
      )
    )
  }

  return (
    <main className="min-h-screen bg-black p-6 text-white">
      <div className="mx-auto max-w-6xl">
        <button
          type="button"
          onClick={() => router.push("/admin")}
          className="rounded-lg bg-zinc-800 px-4 py-2 font-semibold hover:bg-zinc-700"
        >
          ← Back to Admin
        </button>

        <div className="mt-6">
          <h1 className="text-4xl font-bold">
            Player Match Review
          </h1>

          <p className="mt-2 text-zinc-400">
            Review partial name matches before linking
            Discord members to permanent player profiles.
          </p>
        </div>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <p className="text-sm text-zinc-400">
              Unlinked players
            </p>

            <p className="mt-2 text-3xl font-bold">
              {players.length}
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <p className="text-sm text-zinc-400">
              Unlinked Discord members
            </p>

            <p className="mt-2 text-3xl font-bold">
              {members.length}
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <p className="text-sm text-zinc-400">
              Suggested matches
            </p>

            <p className="mt-2 text-3xl font-bold">
              {suggestions.length}
            </p>
          </div>
        </section>

        <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <label className="font-semibold">
            Minimum confidence: {minimumConfidence}%
          </label>

          <input
            type="range"
            min="50"
            max="95"
            step="5"
            value={minimumConfidence}
            onChange={(event) =>
              setMinimumConfidence(
                Number(event.target.value)
              )
            }
            className="mt-3 w-full"
          />
        </section>

        <div className="mt-6">
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="rounded-lg bg-blue-600 px-5 py-3 font-bold hover:bg-blue-500 disabled:bg-zinc-700"
          >
            {loading ? "Loading..." : "Refresh Matches"}
          </button>
        </div>

        {loading ? (
          <p className="mt-8 text-zinc-400">
            Loading unmatched records...
          </p>
        ) : suggestions.length === 0 ? (
          <div className="mt-8 rounded-xl border border-green-800 bg-green-950 p-6">
            ✅ No partial matches meet the selected
            confidence level.
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.player.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900 p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-5">
                  <div className="grid flex-1 gap-4 md:grid-cols-3">
                    <div>
                      <p className="text-xs font-bold uppercase text-zinc-500">
                        Player profile
                      </p>

                      <p className="mt-1 text-xl font-bold">
                        {suggestion.player.screen_name}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-bold uppercase text-zinc-500">
                        Discord member
                      </p>

                      <p className="mt-1 text-xl font-bold">
                        {suggestion.member.discord_name}
                      </p>

                      <p className="mt-1 text-xs text-zinc-500">
                        {suggestion.member.discord_id}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-bold uppercase text-zinc-500">
                        Confidence
                      </p>

                      <p
                        className={`mt-1 text-2xl font-bold ${
                          suggestion.confidence >= 90
                            ? "text-green-400"
                            : suggestion.confidence >= 80
                            ? "text-yellow-400"
                            : "text-orange-400"
                        }`}
                      >
                        {suggestion.confidence}%
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      void approveMatch(suggestion)
                    }
                    disabled={
                      savingId === suggestion.player.id
                    }
                    className="rounded-lg bg-green-600 px-5 py-3 font-bold hover:bg-green-500 disabled:bg-zinc-700"
                  >
                    {savingId === suggestion.player.id
                      ? "Linking..."
                      : "Approve Match"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}