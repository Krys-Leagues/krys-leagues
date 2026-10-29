import Link from "next/link"

export default function ApiSettingsPage() {
  return (
    <main style={page}>
      <h1 style={title}>API Settings</h1>

      <p style={subtitle}>
        Configure API access, tokens, webhooks, and external integrations.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>API Keys</strong>
          <span>
            Manage API credentials and access tokens.
          </span>
        </section>

        <section style={card}>
          <strong>Webhooks</strong>
          <span>
            Configure webhook endpoints and event subscriptions.
          </span>
        </section>

        <section style={card}>
          <strong>Rate Limits</strong>
          <span>
            Configure request limits and API usage policies.
          </span>
        </section>

        <section style={card}>
          <strong>API Logs</strong>
          <span>
            Review API requests and integration activity.
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