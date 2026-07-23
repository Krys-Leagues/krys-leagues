import Link from "next/link"

export default function AdvancedBackupSettingsPage() {
  return (
    <main style={page}>
      <h1 style={title}>Advanced Backup Settings</h1>

      <p style={subtitle}>
        Configure backup schedules, recovery options, retention policies, and disaster recovery.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Backup Schedule</strong>
          <span>
            Configure automatic backups and scheduling.
          </span>
        </section>

        <section style={card}>
          <strong>Recovery Options</strong>
          <span>
            Manage backup restoration and recovery procedures.
          </span>
        </section>

        <section style={card}>
          <strong>Retention Policies</strong>
          <span>
            Configure backup retention and archival settings.
          </span>
        </section>

        <section style={card}>
          <strong>Disaster Recovery</strong>
          <span>
            Review recovery plans and backup health.
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