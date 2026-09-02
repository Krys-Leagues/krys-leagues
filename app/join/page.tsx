"use client"

import { useEffect, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { ArtworkNavigation } from "@/components/navigation/ArtworkNavigation"
import { JoinArtworkOverlay } from "@/components/navigation/JoinArtworkOverlay"
import { createDiscordAuthCallbackUrl } from "@/lib/authReturnTo"
import { joinArtwork } from "@/lib/artworkPageMaps"
import { supabase } from "@/lib/supabase"

export default function JoinPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data, error }) => {
      setUser(data.user)
      if (error) setAuthError("Discord status could not be loaded. Please try again.")
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
      setAuthError("")
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function signInWithDiscord() {
    setAuthError("")
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: { redirectTo: createDiscordAuthCallbackUrl("player") },
    })
    if (error) setAuthError(`Discord sign-in failed: ${error.message}`)
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) {
      setAuthError(`Sign out failed: ${error.message}`)
      return
    }
    setUser(null)
  }

  return (
    <ArtworkNavigation
      definition={joinArtwork}
      overlay={
        <JoinArtworkOverlay
          user={user}
          loading={loading}
          error={authError}
          onSignIn={signInWithDiscord}
          onSignOut={signOut}
        />
      }
    />
  )
}
