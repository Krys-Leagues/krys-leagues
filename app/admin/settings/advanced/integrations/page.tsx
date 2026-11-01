import Link from "next/link"

export default function AdvancedIntegrationSettingsPage() {
  return (
    <main style={page}>
      <h1 style={title}>Advanced Integration Settings</h1>

      <p style={subtitle}>
        Configure advanced integrations, webhooks, APIs, and external services.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>External Services</strong>
          <span>
            Configure advanced third-party integrations.
          </span>
        </section>

        <section style={card}>
          <strong>Webhook Management</strong>
          <span>
            Configure incoming and outgoing webhooks.
          </span>
        </section>

        <section style={card}>
          <strong>API Connections</strong>
          <span>
            Review API connectivity and synchronization.
          </span>
        </section>

        <section style={card}>
          <strong>Integration Diagnostics</strong>
          <span>
            Monitor external services and connection health.
          </span>
        </section>

        <Link href="/admin/settings/system" style={card}>
          <strong>Back to System Settings</strong>
          <span>Return to System Settings.</span>
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