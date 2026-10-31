import Link from "next/link"
import CourseChallengeReviewQueue from "@/components/admin/course-challenges/CourseChallengeReviewQueue"

export default function CourseChallengeReviewDeskPage() {
  return <main style={page}>
    <div style={content}>
      <nav style={nav}><Link href="/admin" style={link}>← Admin Dashboard</Link><Link href="/" style={link}>← Player Site</Link></nav>
      <h1>COURSE CHALLENGE REVIEW DESK</h1>
      <CourseChallengeReviewQueue reviewDesk />
    </div>
  </main>
}

const page: React.CSSProperties = { minHeight: "100vh", padding: 28, background: "#020617", color: "#f8fafc" }
const content: React.CSSProperties = { maxWidth: 1280, margin: "0 auto" }
const nav: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 18 }
const link: React.CSSProperties = { color: "#c4b5fd" }
