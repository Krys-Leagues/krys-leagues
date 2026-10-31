import { createServerSupabaseClient } from "@/lib/supabase/server"
import { safePrelaunchNext } from "@/lib/siteAccess/core"
import { DiscordTestingAccessSignIn, DiscordTestingAccessSignOut } from "./DiscordTestingAccessActions"

export default async function TestingAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const parameters = await searchParams
  const requestedNext = Array.isArray(parameters.next) ? parameters.next[0] : parameters.next
  const next = safePrelaunchNext(requestedNext)
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase.auth.getUser()

  return <main style={page}>
    <section style={card}>
      <p style={eyebrow}>Krys Leagues</p>
      <h1 style={title}>Private testing</h1>
      <p style={message}>Krys Leagues is currently in private testing.</p>
      {data.user ? <DiscordTestingAccessSignOut /> : <DiscordTestingAccessSignIn next={next} />}
    </section>
  </main>
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: 20,
  background: "radial-gradient(circle at top, #172554 0%, #020617 55%, #000 100%)",
  color: "white",
}

const card: React.CSSProperties = {
  width: "min(100%, 560px)",
  padding: "clamp(24px, 6vw, 44px)",
  border: "1px solid #334155",
  borderRadius: 20,
  background: "rgba(2, 6, 23, .94)",
  textAlign: "center",
}

const eyebrow: React.CSSProperties = {
  margin: "0 0 10px",
  color: "#93c5fd",
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: ".14em",
  textTransform: "uppercase",
}

const title: React.CSSProperties = { margin: 0, fontSize: "clamp(32px, 8vw, 48px)" }
const message: React.CSSProperties = { margin: "18px 0 26px", color: "#cbd5e1", lineHeight: 1.6 }
