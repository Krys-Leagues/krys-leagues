"use client"

import { Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"

function AuthCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    async function handleAuth() {
      const league = searchParams.get("league") || "match"
      const code = searchParams.get("code")

      const error = searchParams.get("error")
      const errorCode = searchParams.get("error_code")
      const errorDescription = searchParams.get("error_description")

      if (error) {
        const fullError = [
          error,
          errorCode ? `code:${errorCode}` : "",
          errorDescription ? `desc:${errorDescription}` : "",
        ]
          .filter(Boolean)
          .join(" | ")

        router.replace(`/register?league=${league}&login_error=${encodeURIComponent(fullError)}`)
        return
      }

      if (!code) {
        router.replace(`/register?league=${league}&login_error=no_code`)
        return
      }

      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

      if (exchangeError) {
        router.replace(
          `/register?league=${league}&login_error=${encodeURIComponent(exchangeError.message)}`
        )
        return
      }

      const { data } = await supabase.auth.getSession()

      if (!data.session) {
        router.replace(`/register?league=${league}&login_error=no_session`)
        return
      }

      router.replace(`/register?league=${league}&logged_in=1`)
    }

    handleAuth()
  }, [router, searchParams])

  return (
    <main
      style={{
        background: "#000",
        color: "white",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <h1>Logging you in...</h1>
    </main>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<h1 style={{ color: "white" }}>Loading...</h1>}>
      <AuthCallbackContent />
    </Suspense>
  )
}