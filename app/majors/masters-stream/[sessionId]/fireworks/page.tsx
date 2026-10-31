"use client"

import { useParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

import { MastersHioFireworksView } from "@/components/masters/MastersHioFireworksView"
import type { PublicMajorScoreboard } from "@/lib/majors"
import { supabase } from "@/lib/supabase"

export default function MastersHioFireworksPage() {
  const params = useParams<{ sessionId: string }>()
  const [celebrationKey, setCelebrationKey] = useState<number | null>(null)
  const lastFireworks = useRef<number | null>(null)
  const resetTimer = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    const response = await supabase.rpc("get_public_major_scoreboard", { p_session_id: params.sessionId })
    if (response.error || !response.data) return
    const next = response.data as PublicMajorScoreboard
    const sequence = next.session.fireworks_sequence || 0
    if (lastFireworks.current != null && sequence > lastFireworks.current) {
      if (resetTimer.current != null) window.clearTimeout(resetTimer.current)
      setCelebrationKey(sequence)
      resetTimer.current = window.setTimeout(() => setCelebrationKey(null), 3000)
    }
    lastFireworks.current = sequence
  }, [params.sessionId])

  useEffect(() => {
    // This display-only OBS source is transparent until the controller advances the fireworks sequence.
    void refresh()
    const refreshTimer = window.setInterval(() => void refresh(), 350)
    return () => {
      window.clearInterval(refreshTimer)
      if (resetTimer.current != null) window.clearTimeout(resetTimer.current)
    }
  }, [refresh])

  return <MastersHioFireworksView celebrationKey={celebrationKey} />
}
