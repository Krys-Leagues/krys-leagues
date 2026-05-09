"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"

type Player = {
  id: string
  screen_name: string
  status: string | null
  active: boolean | null
}

export default function MergePlayersPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const removeFromUrl = searchParams.get("remove") || ""

  const [players, setPlayers] = useState<Player[]>([])
  const [removePlayerId, setRemovePlayerId] = useState(removeFromUrl)
  const [keepPlayerId, setKeepPlayerId] = useState("")
  const [loading, setLoading] = useState(false)
  const [merging, setMerging] = useState(false)

  useEffect(() => {
    loadPlayers()
  }, [])

  async function loadPlayers() {
    setLoading(true)

    const { data, error } = await supabase
      .from("players")
      .select("id, screen_name, status, active")
      .order("screen_name", { ascending: true })

    setLoading(false)

    if (error) {
      alert(error.message)
      return
    }

    setPlayers(data || [])
  }

  const removePlayer = useMemo(() => {
    return players.find((p) => p.id === removePlayerId) || null
  }, [players, removePlayerId])

  const keepPlayer = useMemo(() => {
    return players.find((p) => p.id === keepPlayerId) || null
  }, [players, keepPlayerId])

  const keepOptions = players.filter((p) => p.id !== removePlayerId)
  const removeOptions = players.filter((p) => p.id !== keepPlayerId)

  async function updateTableIds(
    table: string,
    column: string,
    removeId: string,
    keepId: string
  ) {
    const { error } = await supabase
      .from(table)
      .update({ [column]: keepId })
      .eq(column, removeId)

    if (error) {
      throw new Error(`${table}.${column}: ${error.message}`)
    }
  }

  async function updateNameText(
    table: string,
    column: string,
    oldName: string,
    newName: string
  ) {
    const { error } = await supabase
      .from(table)
      .update({ [column]: newName })
      .ilike(column, oldName)

    if (error) {
      throw new Error(`${table}.${column}: ${error.message}`)
    }
  }

  async function mergePlayers() {
    if (!removePlayer || !keepPlayer) {
      alert("Choose both players")
      return
    }

    if (removePlayer.id === keepPlayer.id) {
      alert("Remove player and keep player cannot be the same")
      return
    }

    const ok = confirm(
      `Merge ${removePlayer.screen_name} into ${keepPlayer.screen_name}?\n\nThis will move records to ${keepPlayer.screen_name} and delete ${removePlayer.screen_name}.`
    )

    if (!ok) return

    setMerging(true)

    try {
      const removeId = removePlayer.id
      const keepId = keepPlayer.id
      const oldName = removePlayer.screen_name
      const newName = keepPlayer.screen_name

      await updateTableIds("player_trophies", "player_id", removeId, keepId)
      await updateTableIds("player_league_memberships", "player_id", removeId, keepId)

      await updateTableIds("schedule", "player1_id", removeId, keepId)
      await updateTableIds("schedule", "player2_id", removeId, keepId)

      await updateTableIds("results", "player1_id", removeId, keepId)
      await updateTableIds("results", "player2_id", removeId, keepId)

      await updateTableIds("matches", "player1_id", removeId, keepId)
      await updateTableIds("matches", "player2_id", removeId, keepId)

      await updateTableIds("player_tournament_entries", "player_id", removeId, keepId)

      await updateNameText("schedule", "player1", oldName, newName)
      await updateNameText("schedule", "player2", oldName, newName)

      await updateNameText("results", "player1", oldName, newName)
      await updateNameText("results", "player2", oldName, newName)
      await updateNameText("results", "winner", oldName, newName)

      await updateNameText("player_trophies", "player_name", oldName, newName)
      await updateNameText("player_tournament_entries", "player_name", oldName, newName)

      const { error: deleteError } = await supabase
        .from("players")
        .delete()
        .eq("id", removeId)

      if (deleteError) {
        throw new Error(`delete players: ${deleteError.message}`)
      }

      alert(`Merged ${oldName} into ${newName} ✔`)

      router.push("/admin/players")
    } catch (err: any) {
      alert(err.message || "Merge failed")
    }

    setMerging(false)
  }

  return (
    <main style={page}>
      <div style={container}>
        <div style={topBar}>
          <button onClick={() => router.push("/admin/players")} style={backButtonPrimary}>
            ← Players
          </button>

          <button onClick={() => router.push("/admin")} style={backButtonSecondary}>
            ← Admin
          </button>
        </div>

        <div style={card}>
          <h1 style={title}>Merge Players</h1>

          <p style={subtitle}>
            Move duplicate player history into the correct player, then remove the duplicate.
          </p>

          <div style={mergeGrid}>
            <div style={mergeBox}>
              <h2 style={boxTitle}>Remove Duplicate</h2>

              <select
                value={removePlayerId}
                onChange={(e) => setRemovePlayerId(e.target.value)}
                style={input}
              >
                <option value="">Select player to remove</option>
                {removeOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.screen_name}
                  </option>
                ))}
              </select>

              {removePlayer && (
                <div style={previewBox}>
                  <div style={previewName}>{removePlayer.screen_name}</div>
                  <div style={previewText}>This player will be removed after records move.</div>
                </div>
              )}
            </div>

            <div style={arrowBox}>→</div>

            <div style={mergeBox}>
              <h2 style={boxTitle}>Keep Main Player</h2>

              <select
                value={keepPlayerId}
                onChange={(e) => setKeepPlayerId(e.target.value)}
                style={input}
              >
                <option value="">Select player to keep</option>
                {keepOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.screen_name}
                  </option>
                ))}
              </select>

              {keepPlayer && (
                <div style={previewBox}>
                  <div style={previewName}>{keepPlayer.screen_name}</div>
                  <div style={previewText}>This player will receive the records.</div>
                </div>
              )}
            </div>
          </div>

          <div style={warningBox}>
            <strong>Safety:</strong> This moves linked records first, including trophies,
            memberships, schedule, results, matches, and tournament entries.
          </div>

          <button onClick={mergePlayers} disabled={merging || loading} style={mergeSubmitButton}>
            {merging ? "Merging..." : "Merge Players"}
          </button>
        </div>
      </div>
    </main>
  )
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  background: "black",
  color: "white",
  display: "flex",
  justifyContent: "center",
}

const container: React.CSSProperties = {
  width: "100%",
  maxWidth: 1100,
  padding: 30,
}

const topBar: React.CSSProperties = {
  display: "flex",
  gap: 10,
  marginBottom: 20,
}

const backButtonPrimary: React.CSSProperties = {
  padding: "10px 16px",
  background: "#2563eb",
  border: "none",
  borderRadius: 8,
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
}

const backButtonSecondary: React.CSSProperties = {
  padding: "10px 16px",
  background: "#222",
  border: "1px solid #555",
  borderRadius: 8,
  color: "white",
  cursor: "pointer",
}

const card: React.CSSProperties = {
  background: "#050505",
  border: "1px solid #333",
  borderRadius: 18,
  padding: 28,
  boxShadow: "0 0 30px rgba(255,255,255,0.08)",
}

const title: React.CSSProperties = {
  fontSize: 38,
  margin: 0,
}

const subtitle: React.CSSProperties = {
  marginTop: 8,
  color: "#aaa",
  fontSize: 16,
}

const mergeGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  gap: 18,
  marginTop: 28,
  alignItems: "stretch",
}

const mergeBox: React.CSSProperties = {
  background: "#111",
  border: "1px solid #444",
  borderRadius: 14,
  padding: 18,
}

const boxTitle: React.CSSProperties = {
  marginTop: 0,
  fontSize: 24,
}

const input: React.CSSProperties = {
  width: "100%",
  padding: 12,
  background: "#050505",
  border: "1px solid #555",
  color: "white",
  borderRadius: 8,
}

const arrowBox: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 42,
  fontWeight: 900,
  color: "#aaa",
}

const previewBox: React.CSSProperties = {
  marginTop: 16,
  padding: 14,
  background: "#050505",
  border: "1px solid #333",
  borderRadius: 10,
}

const previewName: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 900,
}

const previewText: React.CSSProperties = {
  marginTop: 6,
  color: "#aaa",
}

const warningBox: React.CSSProperties = {
  marginTop: 24,
  padding: 14,
  background: "#1f2937",
  border: "1px solid #374151",
  borderRadius: 10,
  color: "#ddd",
}

const mergeSubmitButton: React.CSSProperties = {
  marginTop: 24,
  width: "100%",
  padding: 16,
  background: "#f59e0b",
  border: "none",
  borderRadius: 12,
  color: "black",
  fontSize: 20,
  fontWeight: 900,
  cursor: "pointer",
}