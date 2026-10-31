"use client"

import { useParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

import { MastersStreamScorecardView } from "@/components/masters/MastersStreamScorecardView"
import type { PublicMajorScoreboard } from "@/lib/majors"
import { supabase } from "@/lib/supabase"

export default function MastersObsScorecardPage() {
  const params = useParams<{ sessionId: string }>()
  const [scoreboard, setScoreboard] = useState<PublicMajorScoreboard | null>(null)
  const [error, setError] = useState("")

  const refresh = useCallback(async () => {
    const response = await supabase.rpc("get_public_major_scoreboard", { p_session_id: params.sessionId })
    if (response.error || !response.data) {
      setError(response.error?.message || "This broadcast scorecard is not published.")
      return
    }
    const next = response.data as PublicMajorScoreboard
    setScoreboard(next)
    setError("")
  }, [params.sessionId])

  useEffect(() => {
    // Public stream display synchronizes automatically; polling is resilient in OBS browser sources.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
    const refreshTimer = window.setInterval(() => void refresh(), 850)
    return () => window.clearInterval(refreshTimer)
  }, [refresh])

  if (!scoreboard) {
    return <main style={waiting}>{error || "Loading broadcast scorecard…"}</main>
  }

  return <MastersStreamScorecardView scoreboard={scoreboard} />
}

const waiting: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  margin: 0,
  background: "transparent",
  color: "#fff",
  font: "700 18px Arial",
}
