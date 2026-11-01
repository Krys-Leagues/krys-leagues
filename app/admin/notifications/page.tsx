import Link from "next/link"

export default function NotificationsAdminPage() {
  return (
    <main style={page}>
      <h1 style={title}>Notifications</h1>

      <p style={subtitle}>
        Manage Discord announcements, reminders, league notifications, and automated messages.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>League Announcements</strong>
          <span>
            Send announcements to players for leagues and tournaments.
          </span>
        </section>

        <section style={card}>
          <strong>Reminder Messages</strong>
          <span>
            Configure automatic reminders for score submissions and matches.
          </span>
        </section>

        <section style={card}>
          <strong>Discord Notifications</strong>
          <span>
            Manage Discord webhook and bot notification settings.
          </span>
        </section>

        <section style={card}>
          <strong>Notification History</strong>
          <span>
            Review previously sent announcements and reminders.
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