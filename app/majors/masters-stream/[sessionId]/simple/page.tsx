"use client"

import { useParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

import { MastersSimpleStreamCard } from "@/components/masters/MastersSimpleStreamCard"
import type { PublicMajorScoreboard } from "@/lib/majors"
import { supabase } from "@/lib/supabase"

export default function MastersSimpleStreamPage() {
  const params = useParams<{ sessionId: string }>()
  const [scoreboard, setScoreboard] = useState<PublicMajorScoreboard | null>(null)

  const refresh = useCallback(async () => {
    const response = await supabase.rpc("get_public_major_scoreboard", { p_session_id: params.sessionId })
    if (!response.error && response.data) setScoreboard(response.data as PublicMajorScoreboard)
  }, [params.sessionId])

  useEffect(() => {
    // Public stream display synchronizes automatically; polling is resilient in OBS browser sources.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
    const timer = window.setInterval(() => void refresh(), 500)
    return () => window.clearInterval(timer)
  }, [refresh])

  if (!scoreboard) return null
  return <MastersSimpleStreamCard scoreboard={scoreboard} />
}
