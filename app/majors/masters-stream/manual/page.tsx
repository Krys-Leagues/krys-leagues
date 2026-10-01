"use client"

import { useCallback, useEffect, useState } from "react"

import { MastersManualStreamCard } from "@/components/masters/MastersManualStreamCard"
import { normalizeManualStreamCard, type MastersManualStreamCard as ManualCardState } from "@/lib/mastersManualStreamCard"
import { supabase } from "@/lib/supabase"

export default function MastersManualStreamPage() {
  const [card, setCard] = useState<ManualCardState | null>(null)

  const refresh = useCallback(async () => {
    const response = await supabase.rpc("get_public_masters_manual_stream_card")
    if (response.error) return
    const nextCard = normalizeManualStreamCard(response.data)
    if (nextCard) setCard(nextCard)
  }, [])

  useEffect(() => {
    // Polling remains dependable inside long-running OBS browser sources.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
    const timer = window.setInterval(() => void refresh(), 400)
    return () => window.clearInterval(timer)
  }, [refresh])

  if (!card) return null
  return <MastersManualStreamCard slots={card.slots} />
}
