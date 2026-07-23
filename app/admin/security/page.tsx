import Link from "next/link"

export default function SecurityAdminPage() {
  return (
    <main style={page}>
      <h1 style={title}>Security</h1>

      <p style={subtitle}>
        Manage administrator access, authentication, permissions, and security settings.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Administrator Access</strong>
          <span>
            Review administrator accounts and access permissions.
          </span>
        </section>

        <section style={card}>
          <strong>Authentication</strong>
          <span>
            Configure login methods and authentication providers.
          </span>
        </section>

        <section style={card}>
          <strong>Permission Groups</strong>
          <span>
            Manage administrator roles and permissions.
          </span>
        </section>

        <section style={card}>
          <strong>Security Events</strong>
          <span>
            Review login history, security alerts, and account activity.
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