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

type Candidate = {
  member: DiscordMember
  confidence: number
  reasons: string[]
}

function normalizeName(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

function splitWords(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function levenshteinDistance(left: string, right: string) {
  const a = normalizeName(left)
  const b = normalizeName(right)

  if (!a) return b.length
  if (!b) return a.length

  const matrix: number[][] = Array.from(
    { length: a.length + 1 },
    () => Array(b.length + 1).fill(0)
  )

  for (let row = 0; row <= a.length; row += 1) {
    matrix[row][0] = row
  }

  for (let column = 0; column <= b.length; column += 1) {
    matrix[0][column] = column
  }

  for (let row = 1; row <= a.length; row += 1) {
    for (let column = 1; column <= b.length; column += 1) {
      const substitutionCost =
        a[row - 1] === b[column - 1] ? 0 : 1

      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost
      )
    }
  }

  return matrix[a.length][b.length]
}

function calculateCandidate(
  playerName: string,
  discordName: string
): {
  confidence: number
  reasons: string[]
} {
  const player = normalizeName(playerName)
  const discord = normalizeName(discordName)

  if (!player || !discord) {
    return {
      confidence: 0,
      reasons: [],
    }
  }

  const reasons: string[] = []
  let score = 0

  if (player === discord) {
    return {
      confidence: 100,
      reasons: ["Exact normalized match"],
    }
  }

  const shorterLength = Math.min(
    player.length,
    discord.length
  )

  const longerLength = Math.max(
    player.length,
    discord.length
  )

  if (
    player.includes(discord) ||
    discord.includes(player)
  ) {
    const containmentScore = Math.round(
      (shorterLength / longerLength) * 95
    )

    score = Math.max(score, containmentScore)
    reasons.push("One name contains the other")
  }

  if (
    player.startsWith(discord) ||
    discord.startsWith(player)
  ) {
    score = Math.max(score, 88)
    reasons.push("Names share the same beginning")
  }

  if (
    player.endsWith(discord) ||
    discord.endsWith(player)
  ) {
    score = Math.max(score, 86)
    reasons.push("Names share the same ending")
  }

  const distance = levenshteinDistance(
    player,
    discord
  )

  const editSimilarity =
    1 - distance / longerLength

  const editScore = Math.max(
    0,
    Math.round(editSimilarity * 100)
  )

  if (editScore >= 45) {
    score = Math.max(score, editScore)

    reasons.push(
      `Similar spelling (${editScore}%)`
    )
  }

  const playerWords = splitWords(playerName)
  const discordWords = splitWords(discordName)

  const commonWords = playerWords.filter((word) =>
    discordWords.includes(word)
  )

  if (commonWords.length > 0) {
    const wordScore = Math.round(
      (commonWords.length /
        Math.max(
          playerWords.length,
          discordWords.length
        )) *
        90
    )

    score = Math.max(score, wordScore)
    reasons.push("Names share words")
  }

  const playerCharacterSet = new Set(
    player.split("")
  )

  const discordCharacterSet = new Set(
    discord.split("")
  )

  const commonCharacters = [
    ...playerCharacterSet,
  ].filter((character) =>
    discordCharacterSet.has(character)
  ).length

  const characterScore = Math.round(
    (commonCharacters /
      Math.max(
        playerCharacterSet.size,
        discordCharacterSet.size
      )) *
      70
  )

  score = Math.max(score, characterScore)

  return {
    confidence: Math.min(99, score),
    reasons: Array.from(new Set(reasons)),
  }
}

export default function PlayerMatchingPage() {
  const router = useRouter()

  const [players, setPlayers] = useState<Player[]>(
    []
  )

  const [members, setMembers] = useState<
    DiscordMember[]
  >([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [currentPlayerIndex, setCurrentPlayerIndex] =
    useState(0)

  const [minimumConfidence, setMinimumConfidence] =
    useState(35)

  const [selectedMemberId, setSelectedMemberId] =
    useState("")

  const [memberSearch, setMemberSearch] =
    useState("")

  useEffect(() => {
    void loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setSelectedMemberId("")
    setCurrentPlayerIndex(0)

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

  const currentPlayer =
    players[currentPlayerIndex] ?? null

  const candidates = useMemo<Candidate[]>(() => {
    if (!currentPlayer) {
      return []
    }

    return members
      .map((member) => {
        const result = calculateCandidate(
          currentPlayer.screen_name,
          member.discord_name
        )

        return {
          member,
          confidence: result.confidence,
          reasons: result.reasons,
        }
      })
      .filter(
        (candidate) =>
          candidate.confidence >=
          minimumConfidence
      )
      .sort(
        (left, right) =>
          right.confidence - left.confidence
      )
      .slice(0, 12)
  }, [
    currentPlayer,
    members,
    minimumConfidence,
  ])

  const searchedMembers = useMemo(() => {
    const query = normalizeName(memberSearch)

    if (!query) {
      return []
    }

    return members
      .filter((member) =>
        normalizeName(
          member.discord_name
        ).includes(query)
      )
      .slice(0, 20)
  }, [members, memberSearch])

  function goToPreviousPlayer() {
    setSelectedMemberId("")
    setMemberSearch("")

    setCurrentPlayerIndex((current) =>
      Math.max(0, current - 1)
    )
  }

  function goToNextPlayer() {
    setSelectedMemberId("")
    setMemberSearch("")

    setCurrentPlayerIndex((current) =>
      Math.min(
        players.length - 1,
        current + 1
      )
    )
  }

  function skipCurrentPlayer() {
    if (
      currentPlayerIndex <
      players.length - 1
    ) {
      goToNextPlayer()
      return
    }

    alert(
      "You have reached the end of the unmatched player list."
    )
  }

  async function approveSelectedMatch() {
    if (!currentPlayer) {
      return
    }

    const selectedMember = members.find(
      (member) =>
        member.id === selectedMemberId
    )

    if (!selectedMember) {
      alert("Select the correct Discord member.")
      return
    }

    const confirmed = window.confirm(
      `Link player "${currentPlayer.screen_name}" to Discord member "${selectedMember.discord_name}"?`
    )

    if (!confirmed) {
      return
    }

    setSaving(true)

    const { error: linkError } = await supabase.rpc("set_site_player_discord_identity", {
      p_player_id: currentPlayer.id,
      p_discord_id: selectedMember.discord_id,
      p_discord_name: selectedMember.discord_name,
    })

    if (linkError) {
      setSaving(false)
      alert(linkError.message)
      return
    }

    const nextPlayers = players.filter(
      (player) =>
        player.id !== currentPlayer.id
    )

    const nextMembers = members.filter(
      (member) =>
        member.id !== selectedMember.id
    )

    setPlayers(nextPlayers)
    setMembers(nextMembers)
    setSelectedMemberId("")
    setMemberSearch("")
    setSaving(false)

    if (nextPlayers.length === 0) {
      setCurrentPlayerIndex(0)
      alert(
        "All remaining player profiles have been reviewed."
      )
      return
    }

    setCurrentPlayerIndex((current) =>
      Math.min(
        current,
        nextPlayers.length - 1
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
            Review each unmatched player and choose
            the correct Discord account.
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
              Current position
            </p>

            <p className="mt-2 text-3xl font-bold">
              {players.length === 0
                ? 0
                : currentPlayerIndex + 1}
              /{players.length}
            </p>
          </div>
        </section>

        <div className="mt-6">
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading || saving}
            className="rounded-lg bg-blue-600 px-5 py-3 font-bold hover:bg-blue-500 disabled:bg-zinc-700"
          >
            {loading
              ? "Loading..."
              : "Refresh Unmatched Records"}
          </button>
        </div>

        {loading ? (
          <p className="mt-8 text-zinc-400">
            Loading unmatched records...
          </p>
        ) : !currentPlayer ? (
          <div className="mt-8 rounded-xl border border-green-800 bg-green-950 p-6">
            ✅ No unmatched player profiles remain.
          </div>
        ) : (
          <>
            <section className="mt-8 rounded-2xl border border-purple-700 bg-purple-950/40 p-6">
              <p className="text-sm font-bold uppercase tracking-wider text-purple-300">
                Player profile being reviewed
              </p>

              <h2 className="mt-2 text-4xl font-bold">
                {currentPlayer.screen_name}
              </h2>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={goToPreviousPlayer}
                  disabled={
                    currentPlayerIndex === 0 ||
                    saving
                  }
                  className="rounded-lg bg-zinc-700 px-4 py-2 font-bold hover:bg-zinc-600 disabled:bg-zinc-900 disabled:text-zinc-600"
                >
                  ← Previous
                </button>

                <button
                  type="button"
                  onClick={skipCurrentPlayer}
                  disabled={saving}
                  className="rounded-lg bg-orange-600 px-4 py-2 font-bold hover:bg-orange-500 disabled:bg-zinc-700"
                >
                  Skip
                </button>

                <button
                  type="button"
                  onClick={goToNextPlayer}
                  disabled={
                    currentPlayerIndex >=
                      players.length - 1 ||
                    saving
                  }
                  className="rounded-lg bg-zinc-700 px-4 py-2 font-bold hover:bg-zinc-600 disabled:bg-zinc-900 disabled:text-zinc-600"
                >
                  Next →
                </button>
              </div>
            </section>

            <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <label className="font-semibold">
                Minimum suggestion confidence:{" "}
                {minimumConfidence}%
              </label>

              <input
                type="range"
                min="20"
                max="90"
                step="5"
                value={minimumConfidence}
                onChange={(event) =>
                  setMinimumConfidence(
                    Number(event.target.value)
                  )
                }
                className="mt-3 w-full"
              />

              <p className="mt-2 text-sm text-zinc-500">
                Lower this slider to show weaker
                suggestions. Nothing links automatically.
              </p>
            </section>

            <section className="mt-6">
              <h2 className="text-2xl font-bold">
                Ranked Discord Suggestions
              </h2>

              {candidates.length === 0 ? (
                <div className="mt-4 rounded-xl border border-yellow-800 bg-yellow-950 p-5 text-yellow-200">
                  No suggestions meet the selected
                  confidence level. Lower the slider or
                  use manual search below.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {candidates.map((candidate) => {
                    const selected =
                      selectedMemberId ===
                      candidate.member.id

                    return (
                      <button
                        key={candidate.member.id}
                        type="button"
                        onClick={() =>
                          setSelectedMemberId(
                            candidate.member.id
                          )
                        }
                        className={`block w-full rounded-xl border p-5 text-left transition ${
                          selected
                            ? "border-green-400 bg-green-950 ring-2 ring-green-400"
                            : "border-zinc-800 bg-zinc-900 hover:border-zinc-600"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div>
                            <p className="text-xl font-bold">
                              {
                                candidate.member
                                  .discord_name
                              }
                            </p>

                            <p className="mt-1 text-xs text-zinc-500">
                              {
                                candidate.member
                                  .discord_id
                              }
                            </p>

                            {candidate.reasons.length >
                              0 && (
                              <p className="mt-2 text-sm text-zinc-400">
                                {candidate.reasons.join(
                                  " • "
                                )}
                              </p>
                            )}
                          </div>

                          <div
                            className={`text-3xl font-bold ${
                              candidate.confidence >= 85
                                ? "text-green-400"
                                : candidate.confidence >=
                                  65
                                ? "text-yellow-400"
                                : "text-orange-400"
                            }`}
                          >
                            {candidate.confidence}%
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h2 className="text-2xl font-bold">
                Manual Discord Search
              </h2>

              <p className="mt-1 text-zinc-400">
                Search all unmatched Discord members
                when the suggested matches are not right.
              </p>

              <input
                value={memberSearch}
                onChange={(event) =>
                  setMemberSearch(event.target.value)
                }
                placeholder="Search Discord name..."
                className="mt-4 w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white"
              />

              {searchedMembers.length > 0 && (
                <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
                  {searchedMembers.map((member) => {
                    const selected =
                      selectedMemberId === member.id

                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() =>
                          setSelectedMemberId(
                            member.id
                          )
                        }
                        className={`block w-full rounded-lg border p-4 text-left ${
                          selected
                            ? "border-green-400 bg-green-950"
                            : "border-zinc-700 bg-black hover:bg-zinc-800"
                        }`}
                      >
                        <p className="font-bold">
                          {member.discord_name}
                        </p>

                        <p className="mt-1 text-xs text-zinc-500">
                          {member.discord_id}
                        </p>
                      </button>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="mt-8 rounded-xl border border-green-800 bg-green-950/40 p-6">
              <h2 className="text-xl font-bold text-green-200">
                Selected Match
              </h2>

              {selectedMemberId ? (
                <>
                  <p className="mt-3 text-green-100">
                    Player:{" "}
                    <strong>
                      {currentPlayer.screen_name}
                    </strong>
                  </p>

                  <p className="mt-1 text-green-100">
                    Discord:{" "}
                    <strong>
                      {
                        members.find(
                          (member) =>
                            member.id ===
                            selectedMemberId
                        )?.discord_name
                      }
                    </strong>
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      void approveSelectedMatch()
                    }
                    disabled={saving}
                    className="mt-5 rounded-lg bg-green-600 px-6 py-3 font-bold hover:bg-green-500 disabled:bg-zinc-700"
                  >
                    {saving
                      ? "Linking Player..."
                      : "Approve and Link"}
                  </button>
                </>
              ) : (
                <p className="mt-3 text-green-100/70">
                  Choose a suggested or searched
                  Discord member first.
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  )
}
