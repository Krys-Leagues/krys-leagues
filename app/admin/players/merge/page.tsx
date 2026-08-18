"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import PlayerAvatar from "@/components/PlayerAvatar"
import { prepareCanonicalAvatarForMerge, removeOldPlayerAvatarObjects } from "@/lib/playerAvatars"

type Player = {
  id: string
  screen_name: string
  status: string | null
  active: boolean | null
}

type MergeResult = {
  kept_player_id: string
  kept_player_name: string
  removed_player_id: string
  removed_player_name: string
  affected_stroke_season_ids: string[]
  affected_stroke_season_numbers: number[]
  affected_season_count: number
}
type AvatarCandidate={player_id:string;screen_name:string;avatar_path:string}

export default function MergePlayersPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const removeFromUrl = searchParams.get("remove") || ""

  const [players, setPlayers] = useState<Player[]>([])
  const [removePlayerId, setRemovePlayerId] = useState(removeFromUrl)
  const [keepPlayerId, setKeepPlayerId] = useState("")
  const [loading, setLoading] = useState(false)
  const [merging, setMerging] = useState(false)
  const [mergeError, setMergeError] = useState("")
  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null)
  const [avatarCandidates,setAvatarCandidates]=useState<AvatarCandidate[]>([])
  const [selectedAvatarPath,setSelectedAvatarPath]=useState("")
  const [avatarConflict,setAvatarConflict]=useState(false)

  useEffect(() => {
    void loadPlayers()
  }, [])

  async function loadPlayers() {
    setLoading(true)
    const { data, error } = await supabase
      .from("players")
      .select("id, screen_name, status, active")
      .eq("active", true)
      .order("screen_name", { ascending: true })
    setLoading(false)

    if (error) {
      setMergeError(error.message)
      return
    }

    setPlayers(data || [])
  }

  const removePlayer = useMemo(
    () => players.find((player) => player.id === removePlayerId) || null,
    [players, removePlayerId]
  )
  const keepPlayer = useMemo(
    () => players.find((player) => player.id === keepPlayerId) || null,
    [players, keepPlayerId]
  )

  const keepOptions = players.filter((player) => player.id !== removePlayerId)
  const removeOptions = players.filter((player) => player.id !== keepPlayerId)

  async function mergePlayers() {
    if (!removePlayer || !keepPlayer) {
      setMergeError("Choose both players")
      return
    }

    if (removePlayer.id === keepPlayer.id) {
      setMergeError("The player to keep and the player to remove must be different")
      return
    }

    setMerging(true);setMergeError("")
    const {data:avatarPreviewData,error:avatarPreviewError}=await supabase.rpc("preview_site_player_avatar_merge",{
      p_keep_player_id:keepPlayer.id,p_merge_player_ids:[removePlayer.id],
    })
    setMerging(false)
    if(avatarPreviewError){setMergeError(avatarPreviewError.message);return}
    const avatarPreview=Array.isArray(avatarPreviewData)?avatarPreviewData[0]:avatarPreviewData
    const reviewedCandidates=(avatarPreview?.avatar_candidates || []) as AvatarCandidate[]
    setAvatarCandidates(reviewedCandidates)
    if(avatarPreview?.avatar_conflict && !selectedAvatarPath){setAvatarConflict(true);return}

    const confirmed = window.confirm(
      `KEEP PLAYER: ${keepPlayer.screen_name}\nMERGE / REMOVE PLAYER: ${removePlayer.screen_name}\n\nThis protected merge is permanent. Continue?`
    )
    if (!confirmed) return

    setMerging(true)
    setMergeError("")
    setMergeResult(null)

    try {
      const preparedAvatar = await prepareCanonicalAvatarForMerge({
        keepPlayerId: keepPlayer.id,
        candidates: reviewedCandidates,
        selectedAvatarPath: selectedAvatarPath || undefined,
      })
      const { data, error } = await supabase.rpc("merge_site_player_identities_with_avatar", {
        p_keep_player_id: keepPlayer.id,
        p_merge_player_ids: [removePlayer.id],
        p_selected_avatar_path: preparedAvatar.sourceAvatarPath,
        p_canonical_avatar_path: preparedAvatar.canonicalAvatarPath,
      })

      if (error) throw new Error(error.message)

      const saved = Array.isArray(data) ? data[0] : data
      if (!saved) throw new Error("The merge completed without returning confirmation")

      setMergeResult({
        kept_player_id: saved.canonical_player_id,
        kept_player_name: saved.canonical_screen_name,
        removed_player_id: removePlayer.id,
        removed_player_name: removePlayer.screen_name,
        affected_stroke_season_ids: [],
        affected_stroke_season_numbers: [],
        affected_season_count: 0,
      })
      const cleanupError = await removeOldPlayerAvatarObjects(preparedAvatar.oldAvatarPaths)
      if (cleanupError) setMergeError(`Merge succeeded, but old avatar cleanup needs review: ${cleanupError}`)
      setRemovePlayerId("")
      setKeepPlayerId("")
      setAvatarCandidates([]);setSelectedAvatarPath("");setAvatarConflict(false)
      await loadPlayers()
    } catch (error: unknown) {
      setMergeError(error instanceof Error ? error.message : "Merge failed")
    } finally {
      setMerging(false)
    }
  }

  function resolveAvatarConflict(){
    if(!keepPlayer||!removePlayer||!selectedAvatarPath)return
    setMergeError("")
    setAvatarConflict(false)
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
            Resolve a duplicate into the canonical player while retaining its historical UUID.
          </p>

          <div style={mergeGrid}>
            <div style={mergeBox}>
              <h2 style={boxTitle}>MERGE / REMOVE PLAYER</h2>
              <select
                value={removePlayerId}
                onChange={(event) => {setRemovePlayerId(event.target.value);setAvatarCandidates([]);setSelectedAvatarPath("");setAvatarConflict(false)}}
                style={input}
              >
                <option value="">Select player to remove</option>
                {removeOptions.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.screen_name}
                  </option>
                ))}
              </select>
              {removePlayer && (
                <div style={previewBox}>
                  <div style={previewName}>{removePlayer.screen_name}</div>
                  <div style={previewText}>This duplicate will be retired from future selection and linked to the canonical player.</div>
                </div>
              )}
            </div>

            <div style={arrowBox}>→</div>

            <div style={mergeBox}>
              <h2 style={boxTitle}>KEEP PLAYER</h2>
              <select
                value={keepPlayerId}
                onChange={(event) => {setKeepPlayerId(event.target.value);setAvatarCandidates([]);setSelectedAvatarPath("");setAvatarConflict(false)}}
                style={input}
              >
                <option value="">Select player to keep</option>
                {keepOptions.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.screen_name}
                  </option>
                ))}
              </select>
              {keepPlayer && (
                <div style={previewBox}>
                  <div style={previewName}>{keepPlayer.screen_name}</div>
                  <div style={previewText}>This player and screen name remain authoritative.</div>
                </div>
              )}
            </div>
          </div>

          <div style={warningBox}>
            <strong>Safety:</strong> The protected merge checks known identity conflicts before
            making one atomic change. Approved Final Scorecard history is never rewritten.
          </div>

          {avatarConflict&&<div style={avatarConflictBox}><strong>AVATAR CONFLICT — REVIEW REQUIRED</strong><p>Choose the avatar that should belong to the KEEP player before merging.</p><div style={avatarGrid}>{avatarCandidates.map((candidate)=><label key={`${candidate.player_id}-${candidate.avatar_path}`} style={avatarOption}><PlayerAvatar screenName={candidate.screen_name} avatarPath={candidate.avatar_path} size={82}/><input type="radio" name="merge-avatar" checked={selectedAvatarPath===candidate.avatar_path} onChange={()=>setSelectedAvatarPath(candidate.avatar_path)}/><span>{candidate.screen_name}</span></label>)}</div><button style={backButtonPrimary} disabled={merging||!selectedAvatarPath} onClick={resolveAvatarConflict}>Use Selected Avatar</button></div>}

          {mergeError && <div style={errorBox}>{mergeError}</div>}

          {mergeResult && (
            <div style={successBox}>
              <strong>Player merge completed.</strong>
              <div style={resultLine}>Kept player: {mergeResult.kept_player_name}</div>
              <div style={resultLine}>Retired duplicate: {mergeResult.removed_player_name}</div>
              <div style={resultLine}>
                Affected Stroke seasons: {mergeResult.affected_stroke_season_numbers.length > 0
                  ? mergeResult.affected_stroke_season_numbers.join(", ")
                  : "None"}
              </div>
              {mergeResult.affected_season_count > 0 && (
                <div style={reviewWarning}>
                  Regenerate and review each affected Stroke schedule before posting it to Discord.
                </div>
              )}
            </div>
          )}

          <button
            onClick={mergePlayers}
            disabled={merging || loading || !removePlayer || !keepPlayer || avatarConflict}
            style={mergeSubmitButton}
          >
            {merging ? "Merging..." : "Confirm Protected Merge"}
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

const container: React.CSSProperties = { width: "100%", maxWidth: 1100, padding: 30 }
const topBar: React.CSSProperties = { display: "flex", gap: 10, marginBottom: 20 }
const backButtonPrimary: React.CSSProperties = {
  padding: "10px 16px", background: "#2563eb", border: "none", borderRadius: 8,
  color: "white", fontWeight: 700, cursor: "pointer",
}
const backButtonSecondary: React.CSSProperties = {
  padding: "10px 16px", background: "#222", border: "1px solid #555", borderRadius: 8,
  color: "white", cursor: "pointer",
}
const card: React.CSSProperties = {
  background: "#050505", border: "1px solid #333", borderRadius: 18, padding: 28,
  boxShadow: "0 0 30px rgba(255,255,255,0.08)",
}
const title: React.CSSProperties = { fontSize: 38, margin: 0 }
const subtitle: React.CSSProperties = { marginTop: 8, color: "#aaa", fontSize: 16 }
const mergeGrid: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 18, marginTop: 28,
  alignItems: "stretch",
}
const mergeBox: React.CSSProperties = {
  background: "#111", border: "1px solid #444", borderRadius: 14, padding: 18,
}
const boxTitle: React.CSSProperties = { marginTop: 0, fontSize: 20 }
const input: React.CSSProperties = {
  width: "100%", padding: 12, background: "#050505", border: "1px solid #555",
  color: "white", borderRadius: 8,
}
const arrowBox: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 42,
  fontWeight: 900, color: "#aaa",
}
const previewBox: React.CSSProperties = {
  marginTop: 16, padding: 14, background: "#050505", border: "1px solid #333", borderRadius: 10,
}
const previewName: React.CSSProperties = { fontSize: 24, fontWeight: 900 }
const previewText: React.CSSProperties = { marginTop: 6, color: "#aaa" }
const warningBox: React.CSSProperties = {
  marginTop: 24, padding: 14, background: "#1f2937", border: "1px solid #374151",
  borderRadius: 10, color: "#ddd",
}
const errorBox: React.CSSProperties = {
  marginTop: 18, padding: 14, background: "#2a0b0b", border: "1px solid #ef4444",
  borderRadius: 10, color: "#fecaca",
}
const successBox: React.CSSProperties = {
  marginTop: 18, padding: 16, background: "#082f1c", border: "1px solid #22c55e",
  borderRadius: 10, color: "#dcfce7",
}
const resultLine: React.CSSProperties = { marginTop: 8 }
const reviewWarning: React.CSSProperties = { marginTop: 12, color: "#fde68a", fontWeight: 700 }
const mergeSubmitButton: React.CSSProperties = {
  marginTop: 24, width: "100%", padding: 16, background: "#f59e0b", border: "none",
  borderRadius: 12, color: "black", fontSize: 20, fontWeight: 900, cursor: "pointer",
}
const avatarConflictBox:React.CSSProperties={marginTop:18,padding:16,background:"#2a1705",border:"1px solid #f59e0b",borderRadius:10,color:"#fde68a"}
const avatarGrid:React.CSSProperties={display:"flex",gap:12,flexWrap:"wrap",margin:"12px 0"}
const avatarOption:React.CSSProperties={display:"flex",alignItems:"center",gap:8,padding:10,background:"#111",border:"1px solid #52525b",borderRadius:10,color:"white"}
