"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import { supabase } from "@/lib/supabase"

type AdminRole =
  | "super_admin"
  | "waitlist_admin"
  | "cup_admin"
  | "stroke_admin"
  | "match_admin"
  | "pro_admin"
  | "doubles_admin"
  | "pyp_admin"
  | "trophy_admin"

type AdminUser = {
  discord_id: string
  discord_username: string | null
  role: AdminRole
  active: boolean
}

const ADMIN_LINKS = [
  { label: "Admin Home", href: "/admin", roles: ["super_admin", "waitlist_admin", "cup_admin", "stroke_admin", "match_admin", "pro_admin", "doubles_admin", "pyp_admin", "trophy_admin"] },

  { label: "Waitlist", href: "/admin/waitlist", roles: ["super_admin", "waitlist_admin"] },

  { label: "Player Tracker", href: "/admin/player-tracker", roles: ["super_admin", "cup_admin"] },
  { label: "Bracket Builder", href: "/admin/bracket-builder", roles: ["super_admin", "cup_admin"] },
  { label: "Bracket Results", href: "/admin/bracket-results", roles: ["super_admin", "cup_admin"] },

  { label: "Stroke Schedule", href: "/admin/stroke/schedule", roles: ["super_admin", "stroke_admin"] },
  { label: "Stroke Results", href: "/admin/stroke/results", roles: ["super_admin", "stroke_admin"] },

  { label: "Match Schedule", href: "/admin/match/schedule", roles: ["super_admin", "match_admin"] },
  { label: "Match Results", href: "/admin/match/results", roles: ["super_admin", "match_admin"] },

  { label: "Pro Schedule", href: "/admin/pro/schedule", roles: ["super_admin", "pro_admin"] },
  { label: "Pro Results", href: "/admin/pro/results", roles: ["super_admin", "pro_admin"] },

  { label: "Doubles Teams", href: "/admin/doubles/teams", roles: ["super_admin", "doubles_admin"] },
  { label: "Doubles Schedule", href: "/admin/doubles/schedule", roles: ["super_admin", "doubles_admin"] },
  { label: "Doubles Results", href: "/admin/doubles/results", roles: ["super_admin", "doubles_admin"] },

  { label: "PYP Schedule", href: "/admin/pyp/schedule", roles: ["super_admin", "pyp_admin"] },
  { label: "PYP Results", href: "/admin/pyp/results", roles: ["super_admin", "pyp_admin"] },

  // 🏆 NEW
  { label: "Trophies", href: "/admin/trophies", roles: ["super_admin", "trophy_admin"] },

  { label: "Players", href: "/admin/players", roles: ["super_admin"] },
  { label: "Standings", href: "/admin/standings", roles: ["super_admin"] },
]

const ROLE_ACCESS: Record<AdminRole, string[]> = {
  super_admin: ["/admin"],
  waitlist_admin: ["/admin", "/admin/waitlist"],
  cup_admin: ["/admin", "/admin/player-tracker", "/admin/bracket-builder", "/admin/bracket-results"],
  stroke_admin: ["/admin", "/admin/stroke"],
  match_admin: ["/admin", "/admin/match"],
  pro_admin: ["/admin", "/admin/pro"],
  doubles_admin: ["/admin", "/admin/doubles"],
  pyp_admin: ["/admin", "/admin/pyp"],
  trophy_admin: ["/admin", "/admin/trophies"], // 🏆 FIXED
}

function routeAllowed(pathname: string, role: AdminRole) {
  if (role === "super_admin") return true

  return ROLE_ACCESS[role].some((allowedPath) => {
    if (allowedPath === "/admin") return pathname === "/admin"
    return pathname.startsWith(allowedPath)
  })
}

function getDiscordInfo(user: any) {
  const identity = user?.identities?.find((item: any) => item.provider === "discord")
  const identityData = identity?.identity_data || {}
  const meta = user?.user_metadata || {}

  return {
    discord_id:
      identityData.sub ||
      identityData.provider_id ||
      meta.sub ||
      meta.provider_id ||
      user?.id,
    discord_username:
      identityData.full_name ||
      identityData.name ||
      identityData.preferred_username ||
      meta.full_name ||
      meta.name ||
      meta.preferred_username ||
      user?.email ||
      "Discord Admin",
  }
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null)

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

    if (!sessionUser) {
      setAdminUser(null)
      setLoading(false)
      return
    }

    const discord = getDiscordInfo(sessionUser)

    const { data: adminData } = await supabase
      .from("admin_users")
      .select("*")
      .eq("discord_id", discord.discord_id)
      .eq("active", true)
      .single()

    setAdminUser(adminData as AdminUser)
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
    setAdminUser(null)
  }

  const visibleLinks = useMemo(() => {
    if (passwordAuthed) return ADMIN_LINKS
    if (!adminUser) return []

    return ADMIN_LINKS.filter((link) => link.roles.includes(adminUser.role))
  }, [adminUser, passwordAuthed])

  const hasAccess =
    passwordAuthed ||
    (adminUser ? routeAllowed(pathname, adminUser.role) : false)

  if (loading) {
    return <main style={{ background: "black", color: "white", minHeight: "100vh", padding: 40 }}>Loading...</main>
  }

  if (!adminUser && !passwordAuthed) {
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
      <nav style={{ padding: 16, display: "flex", flexWrap: "wrap", gap: 10 }}>
        {visibleLinks.map((link) => (
          <Link key={link.href} href={link.href}>
            {link.label}
          </Link>
        ))}
        <button onClick={logout} style={{ marginLeft: "auto" }}>Logout</button>
      </nav>

      {!hasAccess ? <div>No Access</div> : children}
    </main>
  )
}