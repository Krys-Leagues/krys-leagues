"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    handleLogin()
  }, [])

  async function handleLogin() {
    const { data } = await supabase.auth.getSession()

    if (data.session) {
      // 🔥 ALWAYS go to admin home after login
      router.replace("/admin")
    } else {
      router.replace("/")
    }
  }

  return (
    <main style={{ padding: 40, background: "black", color: "white", minHeight: "100vh" }}>
      <h2>Logging you in...</h2>
    </main>
  )
}