"use client"

import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

export default function AccessDeniedActions() {
  const router = useRouter()
  async function signOut() {
    await supabase.auth.signOut()
    router.replace("/admin")
    router.refresh()
  }
  return (
    <div style={row}>
      <button type="button" onClick={() => router.replace("/dashboard")} style={primary}>Go to Player Dashboard</button>
      <button type="button" onClick={() => void signOut()} style={secondary}>Sign Out</button>
    </div>
  )
}

const row: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 }
const primary: React.CSSProperties = { minHeight: 44, padding: "10px 16px", border: 0, borderRadius: 8, background: "#5865f2", color: "white", fontWeight: 700, cursor: "pointer" }
const secondary: React.CSSProperties = { ...primary, background: "#333" }
