"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { formatMajorSlot, isMajorDayLocked, toDateTimeLocal, type MajorDayChoice, type MajorEntry, type MajorEvent, type MajorFinalPlacement, type MajorPlayDay, type MajorScheduleGroup, type MajorScheduleGroupMember, type MajorTestTester, type MajorTimeSlot, type MajorWeekendStatus } from "@/lib/majors"
import { supabase } from "@/lib/supabase"

export default function MajorSchedulingAdminPage() {
  const [events,setEvents]=useState<MajorEvent[]>([])
  const [eventId,setEventId]=useState("")
  const [days,setDays]=useState<MajorPlayDay[]>([])
  const [slots,setSlots]=useState<MajorTimeSlot[]>([])
  const [entries,setEntries]=useState<MajorEntry[]>([])
  const [choices,setChoices]=useState<MajorDayChoice[]>([])
  const [weekend,setWeekend]=useState<MajorWeekendStatus[]>([])
  const [groups,setGroups]=useState<MajorScheduleGroup[]>([])
  const [members,setMembers]=useState<MajorScheduleGroupMember[]>([])
  const [placements,setPlacements]=useState<MajorFinalPlacement[]>([])
  const [testers,setTesters]=useState<MajorTestTester[]>([])
  const [message,setMessage]=useState("")
  const selectedEvent=events.find((event)=>event.id===eventId)

  const loadSchedule=useCallback(async(id:string)=>{
    if(!id)return
    const dayResult=await supabase.from("major_play_days").select("*").eq("major_event_id",id).order("day_number")
    const loadedDays=(dayResult.data as MajorPlayDay[]|null)||[]
    const dayIds=loadedDays.map((day)=>day.id)
    const [slotResult,entryResult,weekendResult,groupResult,placementResult,testerResult]=await Promise.all([
      dayIds.length?supabase.from("major_time_slots").select("*").in("play_day_id",dayIds).order("starts_at"):Promise.resolve({data:[],error:null}),
      supabase.from("major_entries").select("*").eq("major_event_id",id).order("player_screen_name_snapshot"),
      supabase.from("major_entry_weekend_status").select("*").eq("major_event_id",id),
      supabase.from("major_schedule_groups").select("*").eq("major_event_id",id).order("group_label"),
      supabase.from("major_final_placements").select("*").eq("major_event_id",id),
      supabase.rpc("get_major_test_testers",{p_major_event_id:id}),
    ])
    const loadedEntries=(entryResult.data as MajorEntry[]|null)||[]
    const entryIds=loadedEntries.map((entry)=>entry.id)
    const loadedGroups=(groupResult.data as MajorScheduleGroup[]|null)||[]
    const [choiceResult,memberResult]=await Promise.all([
      entryIds.length?supabase.from("major_entry_day_choices").select("*").in("entry_id",entryIds):Promise.resolve({data:[],error:null}),
      loadedGroups.length?supabase.from("major_schedule_group_members").select("*").in("group_id",loadedGroups.map((group)=>group.id)):Promise.resolve({data:[],error:null}),
    ])
    setDays(loadedDays);setSlots((slotResult.data as MajorTimeSlot[]|null)||[]);setEntries(loadedEntries)
    setChoices((choiceResult.data as MajorDayChoice[]|null)||[]);setWeekend((weekendResult.data as MajorWeekendStatus[]|null)||[])
    setGroups(loadedGroups);setMembers((memberResult.data as MajorScheduleGroupMember[]|null)||[]);setPlacements((placementResult.data as MajorFinalPlacement[]|null)||[]);setTesters((testerResult.data as MajorTestTester[]|null)||[])
    setMessage(dayResult.error?.message||slotResult.error?.message||entryResult.error?.message||choiceResult.error?.message||weekendResult.error?.message||groupResult.error?.message||memberResult.error?.message||placementResult.error?.message||testerResult.error?.message||"")
  },[])

  const reloadEvents=useCallback(async(preferred?:string)=>{
    const result=await supabase.from("major_events").select("*").order("slug")
    const loaded=(result.data as MajorEvent[]|null)||[];const next=preferred||loaded[0]?.id||""
    setEvents(loaded);setEventId(next);if(next)await loadSchedule(next)
  },[loadSchedule])

  useEffect(()=>{
    // Initial client-side Supabase synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reloadEvents()
  },[reloadEvents])

  const choicesBySlot=useMemo(()=>new Map(slots.map((slot)=>[slot.id,choices.filter((choice)=>choice.time_slot_id===slot.id)])),[choices,slots])

  async function saveOpening(form:HTMLFormElement){
    const data=new FormData(form)
    const result=await supabase.rpc("configure_major_signup_release",{
      p_major_event_id:eventId,p_release_1_capacity:Number(data.get("capacity")),
      p_public_signup_opens_at:data.get("public_open")?new Date(String(data.get("public_open"))).toISOString():null,
      p_minimum_public_spots_at_open:data.get("public_minimum")?Number(data.get("public_minimum")):null,
      p_priority_signup_enabled:data.get("priority_enabled")==="on",
      p_priority_signup_opens_at:data.get("priority_open")?new Date(String(data.get("priority_open"))).toISOString():null,
      p_priority_source_event_id:data.get("priority_source")?String(data.get("priority_source")):null,
      p_schedule_timezone:String(data.get("timezone")),
    })
    setMessage(result.error?.message||"Release 1 and opening settings saved.");if(!result.error)await reloadEvents(eventId)
  }

  async function releaseSpots(form:HTMLFormElement){
    const amount=Number(new FormData(form).get("release"));const result=await supabase.rpc("release_additional_major_spots",{p_major_event_id:eventId,p_additional_spots:amount})
    setMessage(result.error?.message||`${amount} Release 2 spots added. No third release is available.`);if(!result.error)await reloadEvents(eventId)
  }

  async function saveDay(dayNumber:number,form:HTMLFormElement){
    const data=new FormData(form);const existing=days.find((day)=>day.day_number===dayNumber)
    const result=await supabase.from("major_play_days").upsert({id:existing?.id,major_event_id:eventId,day_number:dayNumber,label:String(data.get("label")),play_date:String(data.get("date")),choices_locked:data.get("locked")==="on"},{onConflict:"major_event_id,day_number"})
    setMessage(result.error?.message||`Day ${dayNumber} saved.`);if(!result.error)await loadSchedule(eventId)
  }

  async function addSlot(dayId:string,form:HTMLFormElement){
    const data=new FormData(form);const result=await supabase.rpc("create_major_time_slot",{p_play_day_id:dayId,p_local_starts_at:String(data.get("time")),p_label:String(data.get("label")||"")})
    setMessage(result.error?.message||"Time added; the day lock deadline was recalculated.");if(!result.error){form.reset();await loadSchedule(eventId)}
  }

  async function movePlayer(entryId:string,dayId:string,slotId:string){
    const result=await supabase.rpc("admin_set_major_day_choice",{p_entry_id:entryId,p_play_day_id:dayId,p_time_slot_id:slotId})
    setMessage(result.error?.message||"Player time updated with administrator override.");if(!result.error)await loadSchedule(eventId)
  }

  async function setWeekendStatus(entryId:string,status:MajorWeekendStatus["competition_status"]){
    const result=await supabase.rpc("set_major_weekend_status",{p_entry_id:entryId,p_status:status})
    setMessage(result.error?.message||"Weekend competition status saved; existing time choices were preserved.");if(!result.error)await loadSchedule(eventId)
  }

  async function savePlacement(entryId:string,form:HTMLFormElement){
    const data=new FormData(form);const placementValue=String(data.get("placement")||"")
    const result=await supabase.rpc("save_major_final_placement",{
      p_entry_id:entryId,p_weekend_field:String(data.get("field")),
      p_field_placement:placementValue?Number(placementValue):null,p_result_status:String(data.get("result_status")),
      p_is_tied:data.get("tied")==="on",p_is_winner:data.get("winner")==="on",
      p_finalize:data.get("finalize")==="on",
    })
    setMessage(result.error?.message||"Major placement saved.");if(!result.error)await loadSchedule(eventId)
  }

  async function publishWeekendField(){
    if(!window.confirm("Publish every staged Main Event / secondary-field decision and eligible weekend room assignment to players now? This action is intentionally one-way."))return
    const result=await supabase.rpc("publish_major_weekend_field",{p_major_event_id:eventId})
    setMessage(result.error?.message||"Weekend field published. The website now reveals each player’s weekend field and published rooms.")
    if(!result.error)await reloadEvents(eventId)
  }

  async function saveGroup(slot:MajorTimeSlot,form:HTMLFormElement){
    const data=new FormData(form);const day=days.find((item)=>item.id===slot.play_day_id);if(!day)return
    const result=await supabase.rpc("save_major_schedule_group",{
      p_id:null,p_major_event_id:eventId,p_play_day_id:day.id,p_time_slot_id:slot.id,p_group_label:String(data.get("label")),
      p_competition:String(data.get("competition")),p_location:String(data.get("location")),p_instructions:String(data.get("instructions")),
      p_admin_notes:String(data.get("notes")),p_is_finalized:data.get("finalized")==="on",p_is_published:data.get("published")==="on",
      p_entry_ids:data.getAll("entry").map(String),
    })
    setMessage(result.error?.message||"Room/group saved.");if(!result.error){form.reset();await loadSchedule(eventId)}
  }

  async function deleteGroup(id:string){
    const result=await supabase.rpc("delete_major_schedule_group",{p_group_id:id});setMessage(result.error?.message||"Room/group deleted.");if(!result.error)await loadSchedule(eventId)
  }

  async function saveInformation(form:HTMLFormElement){
    const data=new FormData(form);const value=(name:string)=>String(data.get(name)||"")
    const result=await supabase.rpc("save_major_event_information",{p_major_event_id:eventId,p_signup_instructions:value("signup"),p_scheduling_instructions:value("scheduling"),p_qualifier_information:value("qualifier"),p_cut_information:value("cut"),p_weekend_information:value("weekend"),p_room_rules:value("rooms"),p_stream_information:value("stream"),p_secondary_trophy_display_name:value("secondary_trophy_name")})
    setMessage(result.error?.message||"Tournament information saved.");if(!result.error)await reloadEvents(eventId)
  }

  async function addTester(form:HTMLFormElement){
    const playerId=String(new FormData(form).get("player_id")||"").trim()
    const result=await supabase.rpc("add_major_test_tester",{p_major_event_id:eventId,p_player_id:playerId})
    setMessage(result.error?.message||"Trusted TEST player added by canonical UUID.");if(!result.error){form.reset();await loadSchedule(eventId)}
  }

  async function removeTester(playerId:string){
    const result=await supabase.rpc("remove_major_test_tester",{p_major_event_id:eventId,p_player_id:playerId})
    setMessage(result.error?.message||"Trusted TEST player removed. Existing TEST history was preserved.");if(!result.error)await loadSchedule(eventId)
  }

  async function setTestListing(listed:boolean){
    const result=await supabase.rpc("set_major_test_event_listing",{p_major_event_id:eventId,p_listed:listed})
    setMessage(result.error?.message||(listed?"TEST event is listed for authenticated trusted testers.":"TEST event is hidden from the normal Majors listing."));if(!result.error)await reloadEvents(eventId)
  }

  return <main style={page}>
    <Link href="/admin/majors" style={link}>← Four Majors admin</Link><h1>Major signup, rooms, and cut</h1>
    <p style={muted}>Times are absolute instants. Configure them in the event IANA timezone; players see their own local timezone. Room size guidance never blocks signup.</p>
    <select style={input} value={eventId} onChange={(event)=>{setEventId(event.target.value);void loadSchedule(event.target.value)}}>{events.map((event)=><option key={event.id} value={event.id}>{event.is_test_event?"TEST EVENT — ":""}{event.name}</option>)}</select>
    {message&&<p style={notice}>{message}</p>}
    {selectedEvent&&<>
      {selectedEvent.is_test_event&&<section style={testCard}><h2>TEST EVENT · TEST DATA — NOT OFFICIAL</h2><p style={muted}>This uses the real reusable Major workflow under a separate event ID. Only canonical players on this allowlist can read and submit TEST signup data.</p><p><Link href={`/majors/${selectedEvent.slug}`} style={link}>Open trusted-tester page →</Link></p>
        <form onSubmit={(event)=>{event.preventDefault();void addTester(event.currentTarget)}}><label style={field}>Canonical player UUID<input name="player_id" required placeholder="00000000-0000-0000-0000-000000000000" style={input}/></label><button style={button}>Add trusted tester</button></form>
        <h3>Trusted testers</h3>{testers.length===0?<p style={muted}>No trusted testers yet.</p>:testers.map((tester)=><div key={tester.player_id} style={groupCard}><div><strong>{tester.screen_name}</strong><code style={uuid}>{tester.player_id}</code><span style={muted}>Added {formatMajorSlot(tester.added_at)}</span></div><button type="button" style={dangerButton} onClick={()=>void removeTester(tester.player_id)}>Remove</button></div>)}
        <label style={check}><input type="checkbox" checked={selectedEvent.test_event_listed} onChange={(event)=>void setTestListing(event.target.checked)}/> Show TEST in the normal Majors listing for signed-in trusted testers</label><p style={muted}>The TEST event remains private and is never exposed anonymously.</p>
      </section>}
      <section style={card}><h2>Field releases and opening</h2><p style={muted}>Hard maximum: 100. Public signup uses released capacity only.</p>
        <form key={`opening-${selectedEvent.id}`} onSubmit={(event)=>{event.preventDefault();void saveOpening(event.currentTarget)}}>
          <div style={settingsGrid}>
            <label style={field}>Release 1 spots<input name="capacity" type="number" min="1" max="100" defaultValue={selectedEvent.initial_release_capacity||50} required style={input}/></label>
            <label style={field}>Public signup opens<input name="public_open" type="datetime-local" defaultValue={toDateTimeLocal(selectedEvent.public_signup_opens_at)} style={input}/></label>
            <label style={field}>Minimum public spots at opening<input name="public_minimum" type="number" min="1" max="100" defaultValue={selectedEvent.minimum_public_spots_at_open||""} placeholder="Optional" style={input}/></label>
            <label style={field}>Event reference timezone<input name="timezone" defaultValue={selectedEvent.schedule_timezone||"America/New_York"} placeholder="America/New_York" required style={input}/></label>
            <label style={field}>Future priority opening<input name="priority_open" type="datetime-local" defaultValue={toDateTimeLocal(selectedEvent.priority_signup_opens_at)} style={input}/></label>
            <label style={field}>Priority source Major<select name="priority_source" defaultValue={selectedEvent.priority_source_event_id||""} style={input}><option value="">None — first Major</option>{events.filter((event)=>event.id!==eventId).map((event)=><option key={event.id} value={event.id}>{event.name}</option>)}</select></label>
          </div>
          <label style={check}><input name="priority_enabled" type="checkbox" defaultChecked={selectedEvent.priority_signup_enabled}/> Enable canonical previous-Major priority access</label>
          {!selectedEvent.priority_signup_enabled&&<p style={muted}>Priority access is off—the required setting for the first Major.</p>}
          <button style={button}>Save Release 1 settings</button>
        </form>
        <form onSubmit={(event)=>{event.preventDefault();void releaseSpots(event.currentTarget)}} style={releaseBox}><h3>Optional Release 2</h3>
          <p style={muted}>Currently released: {selectedEvent.signup_capacity} / 100. Release 2 may add up to {Math.max(0,100-(selectedEvent.signup_capacity||0))}; it may be used once or never.</p>
          {selectedEvent.later_release_used_at?<p style={notice}>Release 2 used: {selectedEvent.later_release_spots} spots. No third release is permitted.</p>:(selectedEvent.signup_capacity||0)>=100?<p style={notice}>The 100-player hard maximum is already released; Release 2 has no remaining spots.</p>:<><label style={field}>Additional spots<input name="release" type="number" min="1" max={100-(selectedEvent.signup_capacity||0)} required style={input}/></label><button style={button}>Use Release 2</button></>}
        </form>
      </section>

      <section style={card}><h2>Editable tournament information</h2><form key={`info-${selectedEvent.id}`} onSubmit={(event)=>{event.preventDefault();void saveInformation(event.currentTarget)}}><label style={field}>Below-cut trophy display name (optional)<input name="secondary_trophy_name" defaultValue={selectedEvent.secondary_trophy_display_name||""} placeholder="Leave blank until the admins decide" style={input}/></label><p style={muted}>This is display wording only. It does not affect identity, scoring, schedules, rooms, placements, or results.</p><div style={infoGrid}>
        {[{name:"signup",label:"Signup instructions",value:selectedEvent.signup_instructions},{name:"scheduling",label:"Scheduling and lock explanation",value:selectedEvent.scheduling_instructions},{name:"qualifier",label:"Qualifier information",value:selectedEvent.qualifier_information},{name:"cut",label:"Friday cut explanation",value:selectedEvent.cut_information},{name:"weekend",label:"Main Event / secondary trophy explanation",value:selectedEvent.weekend_information},{name:"rooms",label:"Room, sportsmanship, and restart rules",value:selectedEvent.room_rules},{name:"stream",label:"Stream information",value:selectedEvent.stream_information}].map(({name,label,value})=><label key={name} style={field}>{label}<textarea name={name} defaultValue={value||""} style={textarea}/></label>)}
      </div><button style={button}>Save tournament information</button></form></section>
    </>}

    <div style={grid}>{[1,2,3,4].map((number)=>{const day=days.find((item)=>item.day_number===number);return <section key={`${eventId}-${number}`} style={card}><h2>Day {number}</h2>
      <form onSubmit={(event)=>{event.preventDefault();void saveDay(number,event.currentTarget)}}><label style={field}>Label<input name="label" required defaultValue={day?.label||`Round ${number}`} style={input}/></label><label style={field}>Official date<input name="date" type="date" required defaultValue={day?.play_date||""} style={input}/></label><label style={check}><input name="locked" type="checkbox" defaultChecked={day?.choices_locked}/> Manual admin lock</label><button style={button}>Save day</button></form>
      {day&&<><p style={isMajorDayLocked(day)?warning:muted}>Player lock: {day.selection_locks_at?formatMajorSlot(day.selection_locks_at):"Add an available time to calculate"}{isMajorDayLocked(day)?" · LOCKED":""}</p><h3>Available times</h3>{slots.filter((slot)=>slot.play_day_id===day.id).map((slot)=><p key={slot.id} style={slotRow}>{formatMajorSlot(slot.starts_at)}{slot.label?` · ${slot.label}`:""} · {(choicesBySlot.get(slot.id)||[]).length} selected</p>)}<form onSubmit={(event)=>{event.preventDefault();void addSlot(day.id,event.currentTarget)}}><label style={field}>Time<input name="time" type="datetime-local" required style={input}/></label><label style={field}>Label (optional)<input name="label" style={input}/></label><button style={button}>Add time</button></form></>}
    </section>})}</div>

    <section style={card}><h2>Players, preferred times, and Friday decision</h2><p style={muted}>Canonical UUID and exact signup snapshot are shown. Admin time changes work after a day locks and do not alter identity.</p>
      {selectedEvent?.weekend_status_published_at?<p style={target}>Weekend field published {formatMajorSlot(selectedEvent.weekend_status_published_at)}. Players can now see their status and published weekend rooms.</p>:<div style={publicationBox}><div><strong>Private staging</strong><p style={muted}>Main/secondary decisions and Saturday/Sunday room details remain hidden from players until this field is deliberately published.</p></div><button type="button" onClick={()=>void publishWeekendField()} style={publishButton}>Publish Weekend Field</button></div>}
      <div style={entryList}>{entries.map((entry)=><article key={entry.id} style={playerCard}><div><strong>{entry.player_screen_name_snapshot}</strong><code style={uuid}>{entry.player_id}</code></div><label style={field}>Weekend status<select value={weekend.find((item)=>item.entry_id===entry.id)?.competition_status||"pending"} onChange={(event)=>void setWeekendStatus(entry.id,event.target.value as MajorWeekendStatus["competition_status"])} style={input}><option value="pending">Pending</option><option value="main">Major Main Event</option><option value="secondary">Secondary trophy field</option></select></label><div>{days.map((day)=>{const choice=choices.find((item)=>item.entry_id===entry.id&&item.play_day_id===day.id);return <label key={day.id} style={compactField}>Day {day.day_number}<select value={choice?.time_slot_id||""} onChange={(event)=>void movePlayer(entry.id,day.id,event.target.value)} style={input}><option value="">No choice</option>{slots.filter((slot)=>slot.play_day_id===day.id).map((slot)=><option key={slot.id} value={slot.id}>{formatMajorSlot(slot.starts_at)}</option>)}</select></label>})}</div></article>)}</div>
    </section>

    <section style={card}><h2>Permanent final placement history</h2><p style={muted}>Placements are within each separate weekend field and may be shared for ties. Admins explicitly designate the official winner after applying the eventual tiebreak rule. No combined Main/Secondary ranking is created.</p>
      <div style={entryList}>{entries.map((entry)=>{const result=placements.find((item)=>item.entry_id===entry.id);const staged=weekend.find((item)=>item.entry_id===entry.id)?.competition_status||"pending";return <article key={`result-${entry.id}`} style={resultCard}><div><strong>{result?.player_screen_name_snapshot||entry.player_screen_name_snapshot}</strong><code style={uuid}>{result?.player_id||entry.player_id}</code></div>{result?.is_finalized?<p style={target}>{result.weekend_field} · {result.field_placement?`${result.is_tied?"T":""}${result.field_placement}`:"No placement"} · {result.result_status}{result.is_winner?" · Official winner":""} · finalized {result.finalized_at?formatMajorSlot(result.finalized_at):""}</p>:<form key={result?.updated_at||entry.id} style={resultForm} onSubmit={(event)=>{event.preventDefault();void savePlacement(entry.id,event.currentTarget)}}><label style={field}>Final field<select name="field" defaultValue={result?.weekend_field||(staged==="main"||staged==="secondary"?staged:"")} required style={input}><option value="">Stage weekend field first</option><option value="main">Main Event</option><option value="secondary">Secondary trophy field</option></select></label><label style={field}>Placement within field<input name="placement" type="number" min="1" defaultValue={result?.field_placement||""} placeholder="3" style={input}/></label><label style={field}>Result status<select name="result_status" defaultValue={result?.result_status||"pending"} style={input}><option value="pending">Pending</option><option value="completed">Completed</option><option value="did_not_finish">Did not finish</option><option value="withdrawn">Withdrawn</option><option value="disqualified">Disqualified</option></select></label><label style={check}><input type="checkbox" name="tied" defaultChecked={result?.is_tied}/> Tied placement</label><label style={check}><input type="checkbox" name="winner" defaultChecked={result?.is_winner}/> Official field winner</label><label style={check}><input type="checkbox" name="finalize"/> Finalize permanently</label><button style={button}>Save placement</button></form>}</article>})}</div>
    </section>

    <section style={card}><h2>Counts and manual room/group assignments</h2><p style={muted}>1 selected: warning · 2: practical minimum · 3: preferred target · 4+: split manually into multiple rooms. These are guidance only.</p>
      {days.map((day)=><div key={day.id} style={dayGroup}><h3>Day {day.day_number} · {day.label}</h3>{slots.filter((slot)=>slot.play_day_id===day.id).map((slot)=>{const selected=choicesBySlot.get(slot.id)||[];const count=selected.length;return <details key={slot.id} style={slotGroup}><summary><strong>{formatMajorSlot(slot.starts_at)}</strong> · <span style={count===3?target:count===2?minimum:count===1||count>3?warning:muted}>{count} selected — {count===1?"one-player warning":count===2?"two-player minimum":count===3?"three-player target":count>3?"multiple rooms needed":"empty"}</span></summary><form onSubmit={(event)=>{event.preventDefault();void saveGroup(slot,event.currentTarget)}}><div style={settingsGrid}><label style={field}>Room/group label<input name="label" required placeholder="Room 1" style={input}/></label><label style={field}>Competition<select name="competition" defaultValue={day.day_number<=2?"qualifying":"main"} style={input}><option value="qualifying">Qualifying</option><option value="main">Main Event</option><option value="secondary">Secondary trophy field</option></select></label><label style={field}>Course/lobby/location<input name="location" style={input}/></label><label style={field}>Player instructions<input name="instructions" style={input}/></label><label style={field}>Admin notes<input name="notes" style={input}/></label></div><div style={memberChecks}>{selected.map((choice)=>{const entry=entries.find((item)=>item.id===choice.entry_id);return <label key={choice.entry_id} style={check}><input type="checkbox" name="entry" value={choice.entry_id}/>{entry?.player_screen_name_snapshot}</label>})}</div><label style={check}><input type="checkbox" name="finalized"/> Finalized</label><label style={check}><input type="checkbox" name="published"/> Publish to assigned players</label><button style={button}>Create room/group</button></form></details>})}</div>)}
      <h3>Existing rooms/groups</h3>{groups.length===0?<p style={muted}>No rooms created yet.</p>:groups.map((group)=><article key={group.id} style={groupCard}><div><strong>{group.group_label}</strong> · {group.competition} · {members.filter((member)=>member.group_id===group.id).length} players<br/><span style={muted}>{group.location||"Location not set"} · {group.is_published?"published":"private"} · {group.is_finalized?"finalized":"draft"}</span></div><button type="button" onClick={()=>void deleteGroup(group.id)} style={dangerButton}>Delete</button></article>)}
    </section>
  </main>
}

const page:React.CSSProperties={minHeight:"100vh",padding:28,background:"#020617",color:"white"}
const link:React.CSSProperties={color:"#93c5fd"};const muted:React.CSSProperties={color:"#94a3b8"};const notice:React.CSSProperties={color:"#fde68a",fontWeight:700};const warning:React.CSSProperties={color:"#fbbf24",fontWeight:800};const minimum:React.CSSProperties={color:"#93c5fd",fontWeight:800};const target:React.CSSProperties={color:"#86efac",fontWeight:800}
const grid:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:16,marginTop:20};const card:React.CSSProperties={marginTop:18,padding:20,border:"1px solid #334155",borderRadius:14,background:"#0f172a"};const field:React.CSSProperties={display:"grid",gap:5,margin:"10px 0",fontWeight:700};const compactField:React.CSSProperties={...field,gridTemplateColumns:"60px minmax(180px,1fr)",alignItems:"center"};const check:React.CSSProperties={display:"flex",gap:8,margin:"12px 0"}
const input:React.CSSProperties={padding:10,borderRadius:7,border:"1px solid #475569",background:"#020617",color:"white"};const textarea:React.CSSProperties={...input,minHeight:100,resize:"vertical"};const button:React.CSSProperties={padding:"9px 13px",border:0,borderRadius:7,background:"#16a34a",color:"white",fontWeight:800};const dangerButton:React.CSSProperties={...button,background:"#991b1b"};const slotRow:React.CSSProperties={padding:8,background:"#020617",borderRadius:7};const settingsGrid:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12};const infoGrid:React.CSSProperties={...settingsGrid,gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))"};const releaseBox:React.CSSProperties={marginTop:20,paddingTop:16,borderTop:"1px solid #334155"};const entryList:React.CSSProperties={display:"grid",gap:12};const playerCard:React.CSSProperties={display:"grid",gridTemplateColumns:"minmax(220px,1fr) minmax(180px,.7fr) minmax(320px,2fr)",gap:16,padding:14,border:"1px solid #334155",borderRadius:10,background:"#020617"};const uuid:React.CSSProperties={display:"block",marginTop:5,color:"#94a3b8",fontSize:11,overflowWrap:"anywhere"};const dayGroup:React.CSSProperties={marginTop:22};const slotGroup:React.CSSProperties={padding:12,margin:"10px 0",border:"1px solid #334155",borderRadius:10,background:"#020617"};const memberChecks:React.CSSProperties={display:"flex",gap:14,flexWrap:"wrap"};const groupCard:React.CSSProperties={display:"flex",justifyContent:"space-between",gap:16,alignItems:"center",padding:12,margin:"8px 0",border:"1px solid #334155",borderRadius:9}
const resultCard:React.CSSProperties={display:"grid",gridTemplateColumns:"minmax(220px,.7fr) minmax(0,2fr)",gap:16,padding:14,border:"1px solid #334155",borderRadius:10,background:"#020617"};const resultForm:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10,alignItems:"end"}
const publicationBox:React.CSSProperties={display:"flex",justifyContent:"space-between",alignItems:"center",gap:18,padding:16,margin:"14px 0",border:"1px solid #be185d",borderRadius:10,background:"#3f0a24"};const publishButton:React.CSSProperties={...button,background:"#be185d",padding:"12px 16px"}
const testCard:React.CSSProperties={...card,border:"2px solid #f59e0b",background:"#451a03"}
