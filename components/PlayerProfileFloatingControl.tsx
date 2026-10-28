"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import PlayerAvatar from "@/components/PlayerAvatar"
import { getCanonicalPlayerAvatar } from "@/lib/playerAvatars"
import { supabase } from "@/lib/supabase"
import styles from "./PlayerProfileFloatingControl.module.css"

function canonicalIdFromRpc(data: unknown): string | null {
  if (typeof data === "string" && data.trim()) return data.trim()
  const row = Array.isArray(data) ? data[0] : data
  if (row && typeof row === "object" && "canonical_player_id" in row) {
    const value = (row as { canonical_player_id?: unknown }).canonical_player_id
    return typeof value === "string" && value.trim() ? value.trim() : null
  }
  return null
}

export default function PlayerProfileFloatingControl() {
  const pathname = usePathname()
  const [player, setPlayer] = useState<{ id: string; avatarPath: string | null } | null>(null)

  const loadPlayer = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) {
      setPlayer(null)
      return
    }

    const { data, error } = await supabase.rpc("current_user_canonical_player_id")
    const canonicalId = error ? null : canonicalIdFromRpc(data)
    if (!canonicalId) {
      setPlayer(null)
      return
    }

    try {
      const avatar = await getCanonicalPlayerAvatar(canonicalId)
      setPlayer({ id: canonicalId, avatarPath: avatar.avatarPath })
    } catch {
      setPlayer({ id: canonicalId, avatarPath: null })
    }
  }, [])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadPlayer(), 0)
    const { data: listener } = supabase.auth.onAuthStateChange(() => void loadPlayer())
    return () => {
      window.clearTimeout(initialLoad)
      listener.subscription.unsubscribe()
    }
  }, [loadPlayer])

  if (!player || pathname.startsWith("/admin") || pathname.startsWith("/api") || pathname.startsWith("/auth")) return null

  return (
    <Link
      href={`/players/${encodeURIComponent(player.id)}`}
      className={styles.control}
      aria-label="Open my player profile"
      title="My player profile"
      data-tour="my-profile-shortcut"
    >
      <PlayerAvatar screenName="My profile" avatarPath={player.avatarPath} size={44} imageFit="cover" className={styles.avatar} />
      <span className="sr-only">My profile</span>
    </Link>
  )
}
