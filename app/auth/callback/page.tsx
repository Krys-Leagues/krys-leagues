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
      // 🔥 This is the fix — go to admin import page
      router.push("/admin/kwt-import")
    } else {
      router.push("/")
    }
  }

  return (
    <main style={{ padding: 40 }}>
      <h2>Logging you in...</h2>
    </main>
  )
}