import Link from "next/link"

export default function AdvancedRolesSettingsPage() {
  return (
    <main style={page}>
      <h1 style={title}>Advanced Roles Settings</h1>

      <p style={subtitle}>
        Configure advanced role management, permissions, and administrator groups.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Role Management</strong>
          <span>
            Create and manage advanced administrator roles.
          </span>
        </section>

        <section style={card}>
          <strong>Permission Groups</strong>
          <span>
            Configure permission inheritance and access groups.
          </span>
        </section>

        <section style={card}>
          <strong>Role Assignments</strong>
          <span>
            Review administrator role assignments and privileges.
          </span>
        </section>

        <section style={card}>
          <strong>Access Auditing</strong>
          <span>
            Review role changes and permission history.
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