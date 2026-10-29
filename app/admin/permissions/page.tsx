import Link from "next/link"

export default function PermissionsAdminPage() {
  return (
    <main style={page}>
      <h1 style={title}>Permissions</h1>

      <p style={subtitle}>
        Configure access rights for administrators and future staff roles.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Page Access</strong>
          <span>
            Control which admin pages each role can access.
          </span>
        </section>

        <section style={card}>
          <strong>League Permissions</strong>
          <span>
            Assign league-specific administrative permissions.
          </span>
        </section>

        <section style={card}>
          <strong>Data Permissions</strong>
          <span>
            Control who can edit, import, export, and delete data.
          </span>
        </section>

        <section style={card}>
          <strong>Permission Audit</strong>
          <span>
            Review all permission assignments across the system.
          </span>
        </section>

        <Link href="/admin/roles" style={card}>
          <strong>Roles</strong>
          <span>Manage administrator roles.</span>
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