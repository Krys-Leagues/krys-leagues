import AccessDeniedActions from "./AccessDeniedActions"

export default async function AccessDeniedPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const reason = (await searchParams).reason
  const admin = reason === "admin" || reason === "admin-unavailable"
  return (
    <main style={page}>
      <h1>{admin ? "Admin Access Denied" : "Access Unavailable"}</h1>
      <p>{admin ? "This Discord account is not authorized for administration." : "This area is not currently available to your account."}</p>
      {admin && <AccessDeniedActions />}
    </main>
  )
}

const page: React.CSSProperties = { minHeight: "100vh", padding: 40, background: "black", color: "white" }
