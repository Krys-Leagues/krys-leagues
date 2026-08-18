"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { consumeAuthReturnTo } from "@/lib/authReturnTo"
import { getDiscordPlayerLoginDestination } from "@/lib/discordPlayerLogin"
import { supabase } from "@/lib/supabase"

const codeExchanges = new Map<string, ReturnType<typeof supabase.auth.exchangeCodeForSession>>()

function exchangeCodeOnce(code: string) {
  const existingExchange = codeExchanges.get(code)
  if (existingExchange) return existingExchange

  const exchange = supabase.auth.exchangeCodeForSession(code)
  codeExchanges.set(code, exchange)
  return exchange
}

async function hasAdminAccess(accessToken: string) {
  const response = await fetch("/api/auth/admin-authorization", {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  })

  if (!response.ok) return null
  return response.json() as Promise<{ siteAdmin?: boolean; soloAdmin?: boolean }>
}

function CallbackHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    async function handleLogin() {
      const code = searchParams.get("code")
      const requestedNext = searchParams.get("next")
      const type = searchParams.get("type")

      const sessionResponse = code
        ? await exchangeCodeOnce(code)
        : await supabase.auth.getSession()
      const session = sessionResponse.data.session

      if (sessionResponse.error || !session) {
        setErrorMessage(
          sessionResponse.error?.message || "Discord authentication failed."
        )
        return
      }

      const next = consumeAuthReturnTo(requestedNext)

      if (type === "admin" || next?.startsWith("/admin")) {
        try {
          const permissions = await hasAdminAccess(session.access_token)
          if (permissions?.siteAdmin) {
            router.replace(next?.startsWith("/admin") ? next : "/admin/command-center")
            return
          }
          if (permissions?.soloAdmin) {
            router.replace(next?.startsWith("/admin/solo") ? next : "/admin/solo")
            return
          }
        } catch {
          setErrorMessage("Administrator authorization could not be verified.")
          return
        }

        router.replace("/dashboard")
        return
      }

      const { data: resolutionRows, error: resolutionError } = await supabase.rpc(
        "resolve_current_discord_player_login"
      )

      if (resolutionError) {
        setErrorMessage(`Player account lookup failed: ${resolutionError.message}`)
        return
      }

      const resolution = (Array.isArray(resolutionRows) ? resolutionRows[0] : resolutionRows) as {
        resolution_status?: "matched" | "no_match" | "conflict"
        canonical_player_id?: string | null
      } | null

      const destination = getDiscordPlayerLoginDestination(resolution, next)
      if (destination) {
        router.replace(destination)
        return
      }

      setErrorMessage("This Discord identity requires administrator review before it can be linked to a player.")
    }

    void handleLogin()
  }, [router, searchParams])

  return (
    <main style={page}>
      <h2>{errorMessage || "Logging you in..."}</h2>
    </main>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<main style={page}>Loading...</main>}>
      <CallbackHandler />
    </Suspense>
  )
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  padding: 40,
  background: "black",
  color: "white",
}
