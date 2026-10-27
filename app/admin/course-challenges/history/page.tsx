import Link from "next/link"
import CourseChallengePlayerHistory from "@/components/admin/course-challenges/CourseChallengePlayerHistory"

export default function CourseChallengePlayerHistoryPage() {
  return <main style={page}><div style={content}><nav style={nav}><Link href="/admin" style={link}>← Admin Dashboard</Link><Link href="/admin/course-challenges" style={link}>Review Queue</Link><Link href="/admin/course-challenges/review-desk" style={link}>Review Desk</Link><Link href="/" style={link}>← Player Site</Link></nav><CourseChallengePlayerHistory /></div></main>
}

const page: React.CSSProperties = { minHeight: "100vh", padding: 28, background: "#020617", color: "#f8fafc" }
const content: React.CSSProperties = { maxWidth: 1280, margin: "0 auto" }
const nav: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 18, marginBottom: 20 }
const link: React.CSSProperties = { color: "#c4b5fd" }
