"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function TourThisArea({ tourId }: { tourId: string }) {
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    let mounted = true
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) setAuthenticated(Boolean(data.session))
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setAuthenticated(Boolean(session))
    })
    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  if (!authenticated) return null

  function startAreaTour() {
    window.dispatchEvent(new CustomEvent("krys-guided-tour-start", { detail: { tourId } }))
  }

  return <button type="button" data-tour-area={tourId} onClick={startAreaTour} style={{ border: "1px solid rgba(165,180,252,.55)", borderRadius: 999, background: "rgba(15,23,42,.88)", color: "#e0e7ff", padding: "8px 12px", font: "inherit", fontSize: 11, fontWeight: 900, letterSpacing: ".1em", cursor: "pointer" }}>TOUR THIS AREA</button>
}
