import Link from "next/link"

const destinations = [
  ["All-Time Records", "/records", "Course and combined All-Time Records across Krys Leagues."],
  ["Stroke Standings", "/standings", "Current public Stroke league standings."],
  ["Match Play Standings", "/match-standings", "Current public Match Play standings."],
  ["Doubles Standings", "/doubles-standings", "Current public Doubles standings."],
  ["Amateur → Pro Standings", "/amateur-pro-standings", "Current public Amateur → Pro standings."],
  ["PYP Standings", "/pyp-standings", "Current public PYP standings."],
  ["Skins Standings", "/skins-standings", "Current public Skins standings."],
] as const

export default function OverallLeaderboardsPage() {
  return <main style={page}><div style={shell}>
    <Link href="/" style={back}>← Krys Leagues</Link>
    <p style={eyebrow}>All competitions</p><h1 style={title}>Overall Leaderboards</h1>
    <p style={copy}>Choose a leaderboard or standings experience. Overall Leaderboards is a neutral hub; Stroke remains its own league.</p>
    <section style={grid}>{destinations.map(([label, href, description]) => <Link key={href} href={href} style={card}><h2>{label}</h2><p style={muted}>{description}</p></Link>)}</section>
  </div></main>
}
const page: React.CSSProperties={minHeight:"100vh",padding:"30px 18px",background:"radial-gradient(circle at top,#172554,#020617 48%,#000)",color:"white"}
const shell: React.CSSProperties={maxWidth:1100,margin:"0 auto"}
const back:React.CSSProperties={color:"white",textDecoration:"none",fontWeight:800}
const eyebrow:React.CSSProperties={marginTop:34,color:"#93c5fd",fontWeight:900,textTransform:"uppercase",letterSpacing:".12em"}
const title:React.CSSProperties={fontSize:"clamp(38px,7vw,58px)",margin:"8px 0"}
const copy:React.CSSProperties={maxWidth:720,color:"#cbd5e1",fontSize:18,lineHeight:1.6}
const grid:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:16,marginTop:28}
const card:React.CSSProperties={padding:22,border:"1px solid #334155",borderRadius:16,background:"#0f172a",color:"white",textDecoration:"none"}
const muted:React.CSSProperties={color:"#cbd5e1",lineHeight:1.5}
