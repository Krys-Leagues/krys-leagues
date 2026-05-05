"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { supabase } from "@/lib/supabase"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)

  const [passwordAuthed, setPasswordAuthed] = useState(false)
  const [password, setPassword] = useState("")

  useEffect(() => {
    checkSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      checkSession()
    })

    return () => subscription.unsubscribe()
  }, [])

  async function checkSession() {
    setLoading(true)

    const { data } = await supabase.auth.getSession()
    const sessionUser = data.session?.user || null

    setUser(sessionUser)
    setLoading(false)
  }

  async function loginWithDiscord() {
    await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        scopes: "identify email",
redirectTo: `${window.location.origin}/admin`,
      },
    })
  }

  function emergencyPasswordLogin() {
    if (password === process.env.NEXT_PUBLIC_ADMIN_PASSWORD) {
      setPasswordAuthed(true)
    } else {
      alert("Wrong password")
    }
  }

  async function logout() {
    setPasswordAuthed(false)
    setPassword("")
    await supabase.auth.signOut()
    setUser(null)
  }

  if (loading) {
    return (
      <main style={{ background: "black", color: "white", minHeight: "100vh", padding: 40 }}>
        Loading...
      </main>
    )
  }

  // 🔒 SIMPLE AUTH (no role restrictions anymore)
  if (!user && !passwordAuthed) {
    return (
      <main style={{ background: "black", color: "white", minHeight: "100vh", padding: 40 }}>
        <h1>Admin Login</h1>

        <button onClick={loginWithDiscord} style={{ padding: 12, background: "#5865F2", color: "white" }}>
          Login with Discord
        </button>

        <hr style={{ margin: 20 }} />

        <input
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button onClick={emergencyPasswordLogin}>Enter</button>
      </main>
    )
  }

  return (
    <main style={{ background: "black", color: "white", minHeight: "100vh" }}>
      <div style={{ padding: 16, display: "flex" }}>
        <button onClick={logout} style={{ marginLeft: "auto" }}>
          Logout
        </button>
      </div>

      {children}
    </main>
  )
}