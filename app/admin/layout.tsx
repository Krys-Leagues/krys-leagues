"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type AdminAccess = "loading" | "signed_out" | "denied" | "authorized"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [access, setAccess] = useState<AdminAccess>("loading")

  useEffect(() => {
    void checkAdminAccess()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void checkAdminAccess()
    })

    return () => subscription.unsubscribe()
  }, [])

  async function checkAdminAccess() {
    setAccess("loading")

    const { data, error } = await supabase.auth.getSession()
    const session = data.session

    if (error || !session) {
      setAccess("signed_out")
      return
    }

    try {
      const response = await fetch("/api/auth/admin-authorization", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      })

      setAccess(response.ok ? "authorized" : "denied")
    } catch {
      setAccess("denied")
    }
  }

  async function loginWithDiscord() {
    await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        scopes: "identify email",
        redirectTo: `${window.location.origin}/auth/callback?type=admin`,
      },
    })
  }

  async function logout() {
    await supabase.auth.signOut()
    setAccess("signed_out")
  }

  if (access === "loading") {
    return <AdminMessage>Checking administrator access...</AdminMessage>
  }

  if (access === "signed_out") {
    return (
      <AdminMessage>
        <h1>Admin Login</h1>
        <button onClick={loginWithDiscord} style={primaryButton}>
          Sign in as an admin
        </button>
      </AdminMessage>
    )
  }

  if (access === "denied") {
    return (
      <AdminMessage>
        <h1>Admin Access Denied</h1>
        <p>This Discord account is not authorized for administration.</p>
        <div style={buttonRow}>
          <button onClick={() => router.replace("/dashboard")} style={primaryButton}>
            Go to Player Dashboard
          </button>
          <button onClick={logout} style={secondaryButton}>
            Sign Out
          </button>
        </div>
      </AdminMessage>
    )
  }

  return (
    <main style={adminShell}>
      <div style={logoutRow}>
        <button onClick={logout} style={secondaryButton}>
          Logout
        </button>
      </div>
      {children}
    </main>
  )
}

function AdminMessage({ children }: { children: React.ReactNode }) {
  return <main style={messagePage}>{children}</main>
}

const messagePage: React.CSSProperties = {
  minHeight: "100vh",
  padding: 40,
  background: "black",
  color: "white",
}

const adminShell: React.CSSProperties = {
  minHeight: "100vh",
  background: "black",
  color: "white",
}

const logoutRow: React.CSSProperties = {
  display: "flex",
  padding: 16,
}

const buttonRow: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  marginTop: 20,
}

const primaryButton: React.CSSProperties = {
  padding: 12,
  border: "none",
  borderRadius: 8,
  background: "#5865F2",
  color: "white",
  cursor: "pointer",
  fontWeight: 700,
}

const secondaryButton: React.CSSProperties = {
  ...primaryButton,
  marginLeft: "auto",
  background: "#333",
}
