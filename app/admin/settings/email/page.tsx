import Link from "next/link"

export default function EmailSettingsPage() {
  return (
    <main style={page}>
      <h1 style={title}>Email Settings</h1>

      <p style={subtitle}>
        Configure email services, templates, and future notification settings.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Email Provider</strong>
          <span>
            Configure SMTP or future email integrations.
          </span>
        </section>

        <section style={card}>
          <strong>Email Templates</strong>
          <span>
            Manage notification and announcement templates.
          </span>
        </section>

        <section style={card}>
          <strong>Outgoing Mail</strong>
          <span>
            Review email delivery settings and status.
          </span>
        </section>

        <section style={card}>
          <strong>Email Logs</strong>
          <span>
            Review sent emails and delivery history.
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