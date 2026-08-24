"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { resolveCurrentPlayer } from "@/lib/currentPlayer"

export default function PlayersWelcome() {
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    void resolveCurrentPlayer().then((resolution) => {
      const key = `krys-players-welcome:${resolution.playerId || "guest"}`
      setPlayerId(resolution.playerId)
      setVisible(window.localStorage.getItem(key) !== "dismissed")
    })
  }, [])

  if (!visible) return null
  const dismiss = () => {
    window.localStorage.setItem(`krys-players-welcome:${playerId || "guest"}`, "dismissed")
    setVisible(false)
  }

  return <section style={{padding:20,marginBottom:20,border:"1px solid #3b82f6",borderRadius:16,background:"rgba(30,64,175,.2)"}}>
    <h2 style={{marginTop:0}}>Welcome to the Players Hub</h2>
    <p style={{color:"#cbd5e1"}}>Open your own profile or browse the public Krys Leagues player directory.</p>
    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
      {playerId && <Link href={`/players/${playerId}`} style={button}>View My Profile</Link>}
      <a href="#player-directory" style={button}>Browse Profiles</a>
      <button type="button" onClick={dismiss} style={dismissButton}>Dismiss</button>
    </div>
  </section>
}

const button: React.CSSProperties = {padding:"10px 14px",borderRadius:10,background:"#2563eb",color:"white",textDecoration:"none",fontWeight:800}
const dismissButton: React.CSSProperties = {...button,border:"1px solid #64748b",background:"transparent",cursor:"pointer"}
