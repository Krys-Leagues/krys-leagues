import Link from "next/link"

import KwtRoomSignupCleanup from "@/components/admin/kwt/KwtRoomSignupCleanup"

export default function KWTAdminPage() {
  return (
    <main style={page}>
      <h1 style={title}>KWT League Admin</h1>

      <p style={subtitle}>
        Manage KWT seasons, scoring, imports, standings, and active games.
      </p>

      <div style={grid}>
        <Link href="/admin/kwt/setup" style={card}>
          <strong>Setup New Season</strong>
          <span>Create or prepare a new KWT season.</span>
        </Link>

        <Link href="/admin/kwt/score-current-season" style={card}>
          <strong>Score Current Season</strong>
          <span>Upload, review, and safely apply the current weekly KWT CSV.</span>
        </Link>

        <Link href="/admin/kwt/week-setup" style={card}>
          <strong>Weekend Setup</strong>
          <span>Verify the authoritative Season/Week, courses, freeze, and event state.</span>
        </Link>

        <Link href="/admin/kwt/week-management" style={card}>
          <strong>Season 15 Week Management</strong>
          <span>Review the twelve-week course order and guarded activation state.</span>
        </Link>

        <Link href="/admin/kwt/week-01-scorecards" style={card}>
          <strong>Week 01 Scorecards</strong>
          <span>Review the supplied Season 15 hole-by-hole CSV without writing Production data.</span>
        </Link>

        <Link href="/admin/kwt/results" style={card}>
          <strong>Gross and NET Results</strong>
          <span>Review protected gross reporting and the public NET result state.</span>
        </Link>

        <Link href="/admin/kwt/scorecards" style={card}>
          <strong>Hole-by-Hole Scorecards</strong>
          <span>Review the Week 01 scorecard evidence and source integrity.</span>
        </Link>

        <Link href="/admin/kwt/divisions" style={card}>
          <strong>Gross and NET Divisions</strong>
          <span>Review division assignments, points, and provisional handling.</span>
        </Link>

        <Link href="/admin/kwt/finalization" style={card}>
          <strong>Weekly Finalization</strong>
          <span>Review the guarded finalization and historical-lock state.</span>
        </Link>

        <Link href="/admin/kwt/trophy-manager" style={card}>
          <strong>KWT Trophy Manager</strong>
          <span>Upload original designs, prepare verified recipients, and review personalized PNG awards.</span>
        </Link>

        <Link href="/admin/kwt/championship-pages" style={card}>
          <strong>KWT Championship Publishing</strong>
          <span>Create private weekly stories, add original artwork, and explicitly approve public KWT memories.</span>
        </Link>

        <Link href="/admin/kwt/aces" style={card}>
          <strong>Ace Leaders and Gross Performance</strong>
          <span>Review hole-based performance reporting when verified rows are available.</span>
        </Link>

        <Link href="/admin/kwt/history" style={card}>
          <strong>Historical Weeks</strong>
          <span>Review immutable weekly and season result history.</span>
        </Link>

        <Link href="/admin/kwt/active-games" style={card}>
          <strong>Active Games</strong>
          <span>Track who is playing, who has submitted, and who needs a reminder.</span>
        </Link>

        <Link href="/admin/players" style={card}>
          <strong>Players</strong>
          <span>View global player list used across all leagues.</span>
        </Link>

        <Link href="/admin" style={card}>
          <strong>Back to Admin Home</strong>
          <span>Return to the main admin dashboard.</span>
        </Link>
      </div>

      <KwtRoomSignupCleanup />
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
