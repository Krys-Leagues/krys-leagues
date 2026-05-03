"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function Admin() {
  const [players, setPlayers] = useState<any[]>([])

  useEffect(() => {
    loadPlayers()
  }, [])

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("players")
      .select("*")
      .order("screen_name", { ascending: true })

    if (error) {
      console.error(error)
      setPlayers([])
      return
    }

    setPlayers(data || [])
  }

  return (
    <main style={{ padding: 24, background: "black", color: "white", minHeight: "100vh" }}>
      <h1>Admin Dashboard</h1>

      <div style={{ marginTop: 20 }}>
        {players.map((p, i) => (
          <div key={i}>
            {p.screen_name} — {p.division}
          </div>
        ))}
      </div>
    </main>
  )
}