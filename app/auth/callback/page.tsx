"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"

function isSafeInternalPath(path: string | null): path is string {
  return Boolean(
    path &&
      path.startsWith("/") &&
      !path.startsWith("//") &&
      !path.includes("\\")
  )
}

function getDiscordProviderId(user: {
  identities?: Array<{
    provider?: string
    identity_data?: Record<string, unknown>
  }>
  user_metadata?: Record<string, unknown>
}) {
  const discordIdentity = user.identities?.find(
    (identity) => identity.provider === "discord"
  )
  const identityData = discordIdentity?.identity_data
  const providerId =
    identityData?.provider_id ||
    identityData?.id ||
    identityData?.sub ||
    user.user_metadata?.provider_id ||
    user.user_metadata?.sub

  return typeof providerId === "string" ? providerId.trim() : ""
}

async function hasAdminAccess(accessToken: string) {
  const response = await fetch("/api/auth/admin-authorization", {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  })

  return response.ok
}

function CallbackHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    async function handleLogin() {
      const code = searchParams.get("code")
      const next = searchParams.get("next")
      const type = searchParams.get("type")

      const sessionResponse = code
        ? await supabase.auth.exchangeCodeForSession(code)
        : await supabase.auth.getSession()
      const session = sessionResponse.data.session

      if (sessionResponse.error || !session) {
        setErrorMessage(
          sessionResponse.error?.message || "Discord authentication failed."
        )
        return
      }

      if (type === "admin" || (isSafeInternalPath(next) && next.startsWith("/admin"))) {
        try {
          if (await hasAdminAccess(session.access_token)) {
            router.replace("/admin/command-center")
            return
          }
        } catch {
          setErrorMessage("Administrator authorization could not be verified.")
          return
        }

        router.replace("/dashboard")
        return
      }

      if (isSafeInternalPath(next)) {
        router.replace(next)
        return
      }

      const discordProviderId = getDiscordProviderId(session.user)

      if (!discordProviderId) {
        setErrorMessage("Discord identity could not be verified.")
        return
      }

      const { data: existingPlayer, error: playerError } = await supabase
        .from("players")
        .select("id")
        .eq("discord_id", discordProviderId)
        .maybeSingle()

      if (playerError) {
        setErrorMessage(`Player account lookup failed: ${playerError.message}`)
        return
      }

      router.replace(existingPlayer ? "/dashboard" : "/join")
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
