import Link from "next/link"
import CourseChallengeReviewQueue from "@/components/admin/course-challenges/CourseChallengeReviewQueue"

export default function CourseChallengesAdminPage() {
  return <main style={page}>
    <div style={content}>
      <nav style={nav}><Link href="/admin" style={link}>← Admin Dashboard</Link><Link href="/" style={link}>← Player Site</Link></nav>
      <h1>Course Challenge Review Queue</h1>
      <p style={intro}>Approve only after checking the player, course, difficulty, Level, private proof, entered H1–H18, authoritative pars, calculated total, and every requirement. Public viewers never receive proof photos or review details.</p>
      <CourseChallengeReviewQueue showRejectedSection />
    </div>
  </main>
}

const page: React.CSSProperties = { minHeight: "100vh", padding: 28, background: "#020617", color: "#f8fafc" }
const content: React.CSSProperties = { maxWidth: 1280, margin: "0 auto" }
const nav: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 18 }
const link: React.CSSProperties = { color: "#c4b5fd" }
const intro: React.CSSProperties = { color: "#cbd5e1", maxWidth: 900, lineHeight: 1.55 }
