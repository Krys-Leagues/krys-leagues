import Link from "next/link"

export default function IntegrationSettingsPage() {
  return (
    <main style={page}>
      <h1 style={title}>Integration Settings</h1>

      <p style={subtitle}>
        Configure external services, APIs, Discord, and future integrations.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Discord Integration</strong>
          <span>
            Configure Discord bots, webhooks, and league announcements.
          </span>
        </section>

        <section style={card}>
          <strong>Supabase</strong>
          <span>
            Review database connection settings and synchronization.
          </span>
        </section>

        <section style={card}>
          <strong>API Integrations</strong>
          <span>
            Configure third-party services used by Krys Leagues.
          </span>
        </section>

        <section style={card}>
          <strong>Connection Status</strong>
          <span>
            Monitor the health of all configured integrations.
          </span>
        </section>

        <Link href="/admin/settings" style={card}>
          <strong>Back to Settings</strong>
          <span>Return to the Settings page.</span>
        </Link>

        <Link href="/admin" style={card}>
          <strong>Back to Admin Home</strong>
          <span>Return to the main admin dashboard.</span>
        </Link>
      </div>
    </main>
  )
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  padding: 24,
  background: "black",
  color: "white",
}

const title: React.CSSProperties = {
  fontSize: 34,
  marginBottom: 8,
}

const subtitle: React.CSSProperties = {
  color: "#cfcfcf",
  marginBottom: 28,
}

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: 14,
}

const card: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 18,
  borderRadius: 14,
  border: "1px solid #333",
  background: "#111",
  color: "white",
  textDecoration: "none",
}