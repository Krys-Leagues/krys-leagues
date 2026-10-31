import Link from "next/link"

export default function RegisterSuccessPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "black",
        color: "white",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
        <h1>You’re on the list ✅</h1>

        <p style={{ fontSize: 18, lineHeight: 1.6 }}>
          Thanks for joining Krys’ Leagues. Your registration was sent to the
          admin waitlist.
        </p>

        <p style={{ fontSize: 16, lineHeight: 1.6 }}>
          An admin will review your Walkabout screen name and Discord info.
        </p>

        <Link
          href="/join"
          style={{
            display: "inline-block",
            marginTop: 20,
            padding: "10px 16px",
            background: "#22c55e",
            color: "white",
            borderRadius: 8,
            textDecoration: "none",
            fontWeight: "bold",
          }}
        >
          Back to Join Page
        </Link>
      </div>
    </main>
  )
}