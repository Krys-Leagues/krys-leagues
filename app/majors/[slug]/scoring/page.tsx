"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { MAJOR_COURSES, formatMajorToPar, majorHoleOutcome, majorRoundDayLabel, type MajorEvent, type MajorPlayerScorecard } from "@/lib/majors"
import { supabase } from "@/lib/supabase"

type MyRound = MajorPlayerScorecard & { scoring_entry_open: boolean; label: string }

export default function MajorPlayerScoringPage() {
  const { slug } = useParams<{ slug: string }>()
  const [event, setEvent] = useState<MajorEvent | null>(null)
  const [rounds, setRounds] = useState<MyRound[]>([])
  const [day, setDay] = useState(1)
  const [values, setValues] = useState<string[]>(Array(18).fill(""))
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const eventResponse = await supabase.from("major_events").select("*").eq("slug", slug).maybeSingle()
    const loaded = eventResponse.data as MajorEvent | null
    setEvent(loaded)
    if (!loaded) return setMessage(eventResponse.error?.message || "Major not found.")
    const response = await supabase.rpc("get_my_major_scorecards", { p_major_event_id: loaded.id })
    const cards = (response.data as MyRound[] | null) || []
    setRounds(cards)
    const preferred = cards.find((card) => card.scoring_entry_open) || cards.at(-1)
    if (preferred) setDay(preferred.day_number)
    setMessage(response.error?.message || "")
  }, [slug])

  // Initial authenticated scorecard synchronization.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])
  const round = rounds.find((item) => item.day_number === day)
  const course = MAJOR_COURSES[round?.course_code || (day <= 2 ? "CBE" : "CBH")]

  useEffect(() => {
    // Inputs intentionally mirror the selected persisted round.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValues(Array.from({ length: 18 }, (_, index) => String(round?.holes?.find((hole) => hole.hole_number === index + 1)?.strokes || "")))
  }, [round])

  const entered = useMemo(() => values.map(Number).filter((value) => value > 0), [values])
  const strokes = entered.reduce((sum, value) => sum + value, 0)
  const parThrough = course.pars.slice(0, entered.length).reduce((sum, value) => sum + value, 0)

  async function save(submit = false) {
    if (!round) return
    setBusy(true); setMessage("")
    const holes = values.flatMap((value, index) => Number(value) > 0 ? [{ hole_number: index + 1, strokes: Number(value) }] : [])
    const response = await supabase.rpc("save_my_major_scorecard", { p_play_day_id: round.play_day_id, p_holes: holes })
    if (response.error) { setBusy(false); return setMessage(response.error.message) }
    if (submit) {
      const submitted = await supabase.rpc("submit_my_major_scorecard", { p_scorecard_id: response.data })
      if (submitted.error) { setBusy(false); return setMessage(submitted.error.message) }
      setMessage("Scorecard submitted and awaiting admin verification.")
    } else setMessage("Draft saved. You may keep editing while this round is open.")
    setBusy(false); await load()
  }

  return <main style={page}><div style={shell}>
    <Link href={`/majors/${slug}`}>← {event?.name || "Major"}</Link>
    {event?.is_test_event && <p style={test}>TEST EVENT · TEST DATA — NOT OFFICIAL</p>}
    <h1>My Major scorecard</h1><p style={muted}>One 18-hole card per tournament day. Enter your own strokes, save a draft, then submit for verification.</p>
    <nav style={tabs}>{rounds.map((item) => <button key={item.play_day_id} onClick={() => setDay(item.day_number)} style={day === item.day_number ? selectedTab : tab}>{majorRoundDayLabel(item.day_number)}</button>)}</nav>
    {!round ? <p>No tournament rounds are configured for your entry.</p> : <>
      <section style={summary}><div><strong>{majorRoundDayLabel(round.day_number)}</strong><span>{course.name} · Par {course.pars.reduce((a,b)=>a+b,0)}</span></div><div><strong>{strokes || "—"}</strong><span>{entered.length} / 18 holes · {formatMajorToPar(strokes - parThrough)}</span></div></section>
      {!round.scoring_entry_open && round.status !== "verified" && <p style={notice}>Score entry is currently closed. An admin opens each round when it is ready.</p>}
      {round.status === "submitted" && <p style={pending}>Awaiting admin verification. Submitted scores cannot be silently changed.</p>}
      {round.status === "verified" && <p style={verified}>Official score verified.</p>}
      <div style={grid}>{course.pars.map((par, index) => { const score=Number(values[index]); return <label key={index} style={hole}><span>Hole {index+1}</span><small>Par {par}</small><input type="number" min={1} max={99} value={values[index]} disabled={!round.scoring_entry_open || !["draft","reopened"].includes(round.status || "draft")} onChange={(e)=>setValues((old)=>old.map((v,i)=>i===index?e.target.value:v))} style={input}/><em>{score ? `${formatMajorToPar(score-par)} · ${majorHoleOutcome(score,par)}` : "—"}</em></label>})}</div>
      <div style={actions}><button disabled={busy || !round.scoring_entry_open || !["draft","reopened"].includes(round.status || "draft")} onClick={()=>save(false)} style={secondary}>Save draft</button><button disabled={busy || !round.scoring_entry_open || values.some((v)=>!Number(v)) || !["draft","reopened"].includes(round.status || "draft")} onClick={()=>save(true)} style={primary}>Submit scorecard</button></div>
    </>}
    {message && <p style={notice}>{message}</p>}
  </div></main>
}

const page:React.CSSProperties={minHeight:"100vh",padding:20,background:"#07120d",color:"#fff"},shell:React.CSSProperties={maxWidth:1100,margin:"auto"},muted:React.CSSProperties={color:"#b7c9be"},test:React.CSSProperties={padding:12,background:"#78350f",fontWeight:900},tabs:React.CSSProperties={display:"flex",gap:8,flexWrap:"wrap",margin:"20px 0"},tab:React.CSSProperties={padding:12,border:"1px solid #365347",borderRadius:10,background:"#102219",color:"white"},selectedTab:React.CSSProperties={...tab,background:"#7d2449",borderColor:"#e8689a"},summary:React.CSSProperties={display:"flex",justifyContent:"space-between",gap:20,padding:18,borderRadius:14,background:"#102219",marginBottom:16},grid:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10},hole:React.CSSProperties={display:"grid",gap:5,padding:12,border:"1px solid #365347",borderRadius:10,background:"#0c1a13"},input:React.CSSProperties={padding:10,fontSize:20,borderRadius:8,border:"1px solid #537264",background:"#06100b",color:"white"},actions:React.CSSProperties={display:"flex",gap:12,marginTop:20},primary:React.CSSProperties={padding:"12px 18px",border:0,borderRadius:9,background:"#15803d",color:"white",fontWeight:900},secondary:React.CSSProperties={...primary,background:"#334155"},notice:React.CSSProperties={padding:12,borderRadius:9,background:"#302916",color:"#fde68a"},pending:React.CSSProperties={...notice,background:"#4c1d36",color:"#f9a8d4"},verified:React.CSSProperties={...notice,background:"#14532d",color:"#bbf7d0"}
