import Link from "next/link"

export default function BackupAdminPage() {
  return (
    <main style={page}>
      <h1 style={title}>Backup & Recovery</h1>

      <p style={subtitle}>
        Backup, restore, and safeguard league data.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Database Backup</strong>
          <span>
            Create and download backups of league data.
          </span>
        </section>

        <section style={card}>
          <strong>Restore Backup</strong>
          <span>
            Restore previously saved database backups.
          </span>
        </section>

        <section style={card}>
          <strong>Automatic Backups</strong>
          <span>
            Configure scheduled backups and retention policies.
          </span>
        </section>

        <section style={card}>
          <strong>Recovery Tools</strong>
          <span>
            Recover deleted or damaged league information.
          </span>
        </section>

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