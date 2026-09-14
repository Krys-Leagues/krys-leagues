"use client"

import Link from "next/link"
import { useCallback, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { playerProfileNavigationPath } from "@/lib/playerProfilesRouting"

type Props = {
  children: ReactNode
  currentPlayerId?: string
  className?: string
  style?: CSSProperties
  ariaLabel?: string
  dataArtworkTargetId?: string
}

function canonicalIdFromRpc(data: unknown): string | null {
  if (typeof data === "string" && data.trim()) return data.trim()
  const row = Array.isArray(data) ? data[0] : data
  if (row && typeof row === "object" && "canonical_player_id" in row) {
    const value = (row as { canonical_player_id?: unknown }).canonical_player_id
    return typeof value === "string" && value.trim() ? value.trim() : null
  }
  return null
}

export default function PlayerProfileNavLink({ children, currentPlayerId, className, style, ariaLabel, dataArtworkTargetId }: Props) {
  const router = useRouter()
  const [message, setMessage] = useState("")

  const resolveOwnPlayer = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) return null

    const { data, error } = await supabase.rpc("current_user_canonical_player_id")
    if (error) return null

    const canonicalId = canonicalIdFromRpc(data)
    return canonicalId
  }, [])
  const href = "/players?browse=1"

  async function navigate(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    setMessage("")

    const canonicalId = await resolveOwnPlayer()
    const destination = playerProfileNavigationPath(currentPlayerId, canonicalId)
    if (!destination) {
      setMessage("Your canonical player profile could not be resolved. Use Player Profiles to browse safely.")
      return
    }

    router.push(destination)
  }

  return (
    <>
      <Link href={href} className={className} style={style} aria-label={ariaLabel} data-artwork-target-id={dataArtworkTargetId} onClick={(event) => void navigate(event)}>
        {children}
      </Link>
      {message ? <span role="alert" style={{ display: "block", marginTop: 8, color: "#fecaca", fontSize: 13 }}>{message}</span> : null}
    </>
  )
}
