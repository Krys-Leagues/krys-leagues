import Link from "next/link"

export default function AppearanceSettingsPage() {
  return (
    <main style={page}>
      <h1 style={title}>Appearance Settings</h1>

      <p style={subtitle}>
        Configure the visual appearance and branding of Krys Leagues.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Site Theme</strong>
          <span>
            Configure colors, themes, and visual styling.
          </span>
        </section>

        <section style={card}>
          <strong>Branding</strong>
          <span>
            Manage logos, banners, icons, and league branding.
          </span>
        </section>

        <section style={card}>
          <strong>Homepage Layout</strong>
          <span>
            Configure featured sections and homepage content.
          </span>
        </section>

        <section style={card}>
          <strong>Display Options</strong>
          <span>
            Manage public display preferences across the website.
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