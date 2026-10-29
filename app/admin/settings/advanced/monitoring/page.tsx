import Link from "next/link"

export default function AdvancedMonitoringSettingsPage() {
  return (
    <main style={page}>
      <h1 style={title}>Advanced Monitoring Settings</h1>

      <p style={subtitle}>
        Configure monitoring, alerts, diagnostics, and application health.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Health Monitoring</strong>
          <span>
            Monitor application status and system health.
          </span>
        </section>

        <section style={card}>
          <strong>Performance Alerts</strong>
          <span>
            Configure alerts for performance and availability.
          </span>
        </section>

        <section style={card}>
          <strong>Diagnostics</strong>
          <span>
            Review diagnostics, logs, and monitoring information.
          </span>
        </section>

        <section style={card}>
          <strong>System Metrics</strong>
          <span>
            Monitor CPU, memory, storage, and application metrics.
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