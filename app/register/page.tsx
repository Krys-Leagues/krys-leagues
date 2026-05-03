"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type LeagueKey = "pyp" | "match" | "stroke" | "pro" | "doubles" | "community" | "cups"

const LEAGUE_INFO: Record<LeagueKey, any> = {
  pyp: { title: "Pick Your Poison", leagueType: "pyp", media: "/league-media/pyp.mov", type: "video" },
  match: { title: "Match League", leagueType: "match", media: "/league-media/match.png", type: "image", headToHead: true },
  stroke: { title: "Stroke League", leagueType: "stroke", media: "/league-media/stroke.mov", type: "video", headToHead: true },
  pro: { title: "Pro League", leagueType: "pro", media: "/league-media/pro.mov", type: "video", headToHead: true },
  doubles: { title: "Doubles League", leagueType: "doubles", media: "/league-media/doubles.png", type: "image", headToHead: true },
  community: { title: "Community / Leaderboards", leagueType: "community", media: "/league-media/match.png", type: "image" },
  cups: { title: "Bracket / Cup System", leagueType: "cups", media: "/league-media/match.png", type: "image" },
}

function RegisterContent() {
  const params = useSearchParams()
  const router = useRouter()

  const leagueParam = params.get("league") as LeagueKey | null
  const leagueKey: LeagueKey = leagueParam && LEAGUE_INFO[leagueParam] ? leagueParam : "match"
  const league = LEAGUE_INFO[leagueKey]

  const [user, setUser] = useState<any>(null)
  const [screenName, setScreenName] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user || null)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const discordInfo = useMemo(() => {
    if (!user) return null

    const identity = user.identities?.find((item: any) => item.provider === "discord")
    const identityData = identity?.identity_data || {}
    const meta = user.user_metadata || {}

    return {
      discord_id:
        identityData.sub ||
        identityData.provider_id ||
        meta.sub ||
        meta.provider_id ||
        user.id,
      discord_username:
        identityData.full_name ||
        identityData.name ||
        identityData.preferred_username ||
        meta.full_name ||
        meta.name ||
        meta.preferred_username ||
        user.email ||
        "Discord User",
      discord_avatar:
        identityData.avatar_url ||
        identityData.picture ||
        meta.avatar_url ||
        meta.picture ||
        null,
    }
  }, [user])

  async function loginWithDiscord() {
    setMessage("")

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        scopes: "identify email", // 🔥 FIX
        redirectTo: `${window.location.origin}/auth/callback?league=${leagueKey}`,
      },
    })

    if (error) {
      setMessage("Login failed. Please try again or check your Discord email settings.")
    }
  }

  async function submitRegistration() {
    if (!discordInfo) {
      setMessage("Please login with Discord first.")
      return
    }

    if (!screenName.trim()) {
      setMessage("Please enter your Walkabout screen name.")
      return
    }

    setSubmitting(true)
    setMessage("")

    const { error } = await supabase.from("player_waitlist").insert({
      screen_name: screenName.trim(),
      league_type: league.leagueType,
      discord_id: discordInfo.discord_id,
      discord_username: discordInfo.discord_username,
      discord_avatar: discordInfo.discord_avatar,
    })

    setSubmitting(false)

    if (error) {
      setMessage("Registration failed. Try again or contact an admin.")
      return
    }

    router.push("/register/success") // ✅ redirect
  }

  return (
    <main style={{ background: "#000", color: "#fff", minHeight: "100vh", padding: 12 }}>
      <div style={{ maxWidth: 900 }}>
        {league.type === "video" ? (
          <video src={league.media} autoPlay loop muted playsInline style={{ width: "100%" }} />
        ) : (
          <img src={league.media} alt={league.title} style={{ width: "100%" }} />
        )}

        <h1 style={{ fontSize: 18, marginTop: 16 }}>{league.title} Registration</h1>

        {league.headToHead && (
          <p style={{ color: "#f87171" }}>
            Head-to-head leagues are 18+.
          </p>
        )}

        {!league.headToHead && (
          <p style={{ color: "#aaa" }}>
            Open to all skill levels.
          </p>
        )}

        {loading ? (
          <p>Checking Discord login...</p>
        ) : !user ? (
          <>
            <p>Login with Discord first, then enter your Walkabout screen name.</p>

            <button
              onClick={loginWithDiscord}
              style={{
                background: "#5865F2",
                color: "white",
                border: "none",
                borderRadius: 7,
                padding: "14px 18px",
                fontSize: 16,
                cursor: "pointer",
              }}
            >
              Login with Discord
            </button>
          </>
        ) : (
          <div style={{ marginTop: 16 }}>
            <p>
              Logged in as <strong>{discordInfo?.discord_username}</strong>
            </p>

            <input
              value={screenName}
              onChange={(e) => setScreenName(e.target.value)}
              placeholder="Walkabout screen name"
              style={{
                width: "100%",
                maxWidth: 420,
                padding: 12,
                borderRadius: 7,
                border: "1px solid #444",
                background: "#111",
                color: "white",
                fontSize: 16,
              }}
            />

            <br /><br />

            <button
              onClick={submitRegistration}
              disabled={submitting}
              style={{
                background: submitting ? "#555" : "#22c55e",
                color: "white",
                border: "none",
                borderRadius: 7,
                padding: "12px 16px",
                fontSize: 16,
                cursor: submitting ? "not-allowed" : "pointer",
              }}
            >
              {submitting ? "Submitting..." : "Submit Registration"}
            </button>
          </div>
        )}

        {message && <p style={{ marginTop: 16, color: "#f87171" }}>{message}</p>}
      </div>
    </main>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<main style={{ background: "#000", color: "#fff", minHeight: "100vh" }}>Loading...</main>}>
      <RegisterContent />
    </Suspense>
  )
}