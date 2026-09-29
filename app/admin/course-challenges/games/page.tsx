import Link from "next/link"

import CourseChallengeGameHistory from "@/components/admin/course-challenges/CourseChallengeGameHistory"

export default function CourseChallengeGameHistoryPage() {
  return <main style={page}>
    <div style={content}>
      <nav style={nav}>
        <Link href="/admin/course-challenges" style={link}>← Course Challenge Review</Link>
        <Link href="/admin" style={link}>← Admin Dashboard</Link>
      </nav>
      <h1>Course Challenge Game History</h1>
      <p style={intro}>Private operational history for Discord Course Challenge games. This does not award or change Course Challenge progress.</p>
      <CourseChallengeGameHistory />
    </div>
  </main>
}

const page: React.CSSProperties = { minHeight: "100vh", padding: 28, background: "#020617", color: "#f8fafc" }
const content: React.CSSProperties = { maxWidth: 1400, margin: "0 auto" }
const nav: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 18 }
const link: React.CSSProperties = { color: "#c4b5fd" }
const intro: React.CSSProperties = { color: "#cbd5e1", maxWidth: 900, lineHeight: 1.55 }
