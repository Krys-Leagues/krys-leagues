"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { formatMgaLocalTime, MGA_DAYS, MGA_REGULAR_EVENT_ID, type MgaDayKey, type MgaRoomSnapshot } from "@/lib/mgaRegular"
import { supabase } from "@/lib/supabase"
import styles from "./page.module.css"

type SlotGroup = NonNullable<MgaRoomSnapshot["players"]>[number]["selections"][number] & {
  players: MgaRoomSnapshot["players"]
}

export default function MgaRoomAdminPage() {
  const [snapshot, setSnapshot] = useState<MgaRoomSnapshot | null>(null)
  const [dayKey, setDayKey] = useState<MgaDayKey>("thursday")
  const [capacityDraft, setCapacityDraft] = useState("4")
  const [roomNames, setRoomNames] = useState<Record<string, string>>({})
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    const response = await supabase.rpc("mga_regular_room_admin_v1", { p_event_id: MGA_REGULAR_EVENT_ID })
    const value = Array.isArray(response.data) ? response.data[0] : response.data
    if (response.error || !value) {
      setError(response.error?.message || "The MGA room service returned no roster.")
      setSnapshot(null)
    } else {
      setSnapshot(value as MgaRoomSnapshot)
      setCapacityDraft(String((value as MgaRoomSnapshot).room_capacity || 4))
      setRoomNames(Object.fromEntries(((value as MgaRoomSnapshot).rooms || []).map((room) => [room.id, room.room_name])))
    }
    setLoading(false)
  }, [])

  // Initial owner-authorized roster synchronization.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const day = MGA_DAYS.find((item) => item.key === dayKey) || MGA_DAYS[0]
  const publishedAt = snapshot?.days?.find((item) => item.day_key === dayKey)?.published_at || null
  const slotGroups = useMemo(() => {
    const grouped = new Map<string, SlotGroup>()
    for (const player of snapshot?.players || []) {
      for (const selection of player.selections || []) {
        if (selection.day_key !== dayKey) continue
        const group = grouped.get(selection.time_slot_id) || { ...selection, players: [] }
        group.players.push(player)
        grouped.set(selection.time_slot_id, group)
      }
    }
    return [...grouped.values()].sort((a, b) => a.event_date.localeCompare(b.event_date) || a.slot_number - b.slot_number)
  }, [dayKey, snapshot])

  async function perform(rpc: string, args: Record<string, unknown>, success: string) {
    setBusy(true)
    setError("")
    setMessage("")
    const response = await supabase.rpc(rpc, args)
    setBusy(false)
    if (response.error) {
      setError(response.error.message)
      return
    }
    setMessage(success)
    await load()
  }

  function changeAssignment(registrationId: string, timeSlotId: string, roomId: string) {
    if (!snapshot) return
    const player = snapshot.players.find((item) => item.registration_id === registrationId)
    const selection = player?.selections.find((item) => item.day_key === dayKey)
    const room = snapshot.rooms.find((item) => item.id === roomId)
    if (!roomId) {
      void perform("mga_regular_room_unassign_v1", { p_event_id: MGA_REGULAR_EVENT_ID, p_registration_id: registrationId, p_day_key: dayKey }, "Player unassigned.")
      return
    }
    if (!selection || selection.time_slot_id !== timeSlotId || room?.time_slot_id !== timeSlotId || room.day_key !== dayKey) {
      setError("Players must stay in rooms matching their booked day and time.")
      return
    }
    const alreadyInRoom = snapshot.assignments.some((item) => item.room_id === roomId && item.registration_id === registrationId)
    const occupants = snapshot.assignments.filter((item) => item.room_id === roomId && item.registration_id !== registrationId).length
    if (!alreadyInRoom && occupants >= snapshot.room_capacity) {
      setError("Room capacity reached. Choose another room or increase capacity.")
      return
    }
    void perform("mga_regular_room_assign_v1", {
      p_event_id: MGA_REGULAR_EVENT_ID,
      p_registration_id: registrationId,
      p_day_key: dayKey,
      p_time_slot_id: timeSlotId,
      p_room_id: roomId,
    }, "Player assignment saved.")
  }

  function publishDay() {
    const prompt = publishedAt
      ? `Unpublish ${day.label} room assignments and hide them from players?`
      : `Publish ${day.label}'s room assignments so registered players can see them?`
    if (!window.confirm(prompt)) return
    void perform(publishedAt ? "mga_regular_room_unpublish_day_v1" : "mga_regular_room_publish_day_v1", {
      p_event_id: MGA_REGULAR_EVENT_ID,
      p_day_key: dayKey,
    }, publishedAt ? "Day returned to private draft." : "Room assignments published to players.")
  }

  return <main className={styles.page}>
    <div className={styles.shell}>
      <nav className={styles.nav}><Link href="/admin/majors">← Four Majors</Link><Link href="/mga">Player MGA page</Link></nav>
      <header className={styles.hero}><p className={styles.eyebrow}>Main site · Four Majors</p><h1>MGA Championship Rooms</h1><p>Organize the existing MGA roster by its saved Thursday–Sunday booking times. Room changes never alter a booked time.</p></header>
      {loading && <p className={styles.notice} role="status">Loading the authoritative MGA registration roster…</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {snapshot && <>
        <section className={styles.controls}>
          <div><strong>{snapshot.players.length} registered players</strong><span> · {snapshot.assignments.length} room assignments saved</span></div>
          <label>Maximum players per room
            <input type="number" min={1} max={100} value={capacityDraft} onChange={(event) => setCapacityDraft(event.target.value)} />
          </label>
          <button disabled={busy || !Number.isInteger(Number(capacityDraft)) || Number(capacityDraft) < 1 || Number(capacityDraft) > 100} onClick={() => void perform("mga_regular_room_capacity_v1", { p_event_id: MGA_REGULAR_EVENT_ID, p_room_capacity: Number(capacityDraft) }, "Room capacity saved.")}>Save capacity</button>
          <button className={styles.secondary} disabled={busy} onClick={() => void load()}>Refresh roster</button>
        </section>
        <div className={styles.dayTabs} role="tablist" aria-label="Tournament day">
          {MGA_DAYS.map((item) => <button key={item.key} role="tab" aria-selected={dayKey === item.key} className={dayKey === item.key ? styles.selectedTab : ""} onClick={() => setDayKey(item.key)}>{item.label}</button>)}
        </div>
        <p className={styles.privacy}>{publishedAt ? `Published ${new Date(publishedAt).toLocaleString()}. Unpublish before changing rooms.` : "Draft assignments are private to authorized Admins."}</p>
        {slotGroups.length === 0 && <section className={styles.panel}>No registered players have a saved {day.label} selection.</section>}
        <div className={styles.slots}>
          {slotGroups.map((slot) => {
            const rooms = snapshot.rooms.filter((item) => item.day_key === dayKey && item.time_slot_id === slot.time_slot_id)
            return <section className={styles.slot} key={slot.time_slot_id}>
              <header className={styles.slotHeading}>
                <div><p className={styles.eyebrow}>{day.label} · Time Slot {slot.slot_number}</p><h2>{slot.course_name || "Gardens of Babylon"}</h2><p>{formatMgaLocalTime(slot.starts_at, "America/New_York")} · Eastern event time</p></div>
                <button disabled={busy || Boolean(publishedAt)} onClick={() => void perform("mga_regular_room_create_v1", { p_event_id: MGA_REGULAR_EVENT_ID, p_day_key: dayKey, p_time_slot_id: slot.time_slot_id, p_room_name: null }, "Room created.")}>Create KMGA{snapshot.next_room_number}</button>
              </header>
              <div className={styles.columns}>
                <section><h3>Booked players <span>{slot.players.length}</span></h3><div className={styles.playerList}>
                  {slot.players.map((player) => {
                    const assigned = snapshot.assignments.find((item) => item.registration_id === player.registration_id && item.day_key === dayKey)
                    return <div className={styles.playerRow} key={player.registration_id}>
                      <div><strong>{player.screen_name}</strong><span>{formatMgaLocalTime(slot.starts_at, player.player_time_zone)} · {player.player_time_zone}</span></div>
                      <select aria-label={`Room for ${player.screen_name}`} value={assigned?.room_id || ""} disabled={busy || Boolean(publishedAt)} onChange={(event) => changeAssignment(player.registration_id, slot.time_slot_id, event.target.value)}>
                        <option value="">Unassigned</option>
                        {rooms.map((room) => <option key={room.id} value={room.id}>{room.room_name} ({room.player_count}/{snapshot.room_capacity})</option>)}
                      </select>
                    </div>
                  })}
                </div></section>
                <section><h3>Rooms <span>{rooms.length}</span></h3><div className={styles.roomList}>
                  {rooms.map((room) => {
                    const members = snapshot.assignments.filter((item) => item.room_id === room.id).map((item) => snapshot.players.find((player) => player.registration_id === item.registration_id)?.screen_name).filter(Boolean)
                    return <article className={styles.roomCard} key={room.id}>
                      <div className={styles.roomHeader}><strong>{room.room_name}</strong><span>{room.player_count}/{snapshot.room_capacity}</span></div>
                      <div className={styles.rename}><input aria-label={`Room name ${room.room_name}`} maxLength={40} value={roomNames[room.id] ?? room.room_name} disabled={busy || Boolean(publishedAt)} onChange={(event) => setRoomNames((current) => ({ ...current, [room.id]: event.target.value }))} /><button disabled={busy || Boolean(publishedAt) || !(roomNames[room.id] || "").trim()} onClick={() => void perform("mga_regular_room_rename_v1", { p_event_id: MGA_REGULAR_EVENT_ID, p_room_id: room.id, p_room_name: roomNames[room.id] || room.room_name }, "Room name saved.")}>Save name</button><button className={styles.danger} disabled={busy || Boolean(publishedAt) || room.player_count > 0} onClick={() => { if (window.confirm("Delete this empty room?")) void perform("mga_regular_room_delete_v1", { p_event_id: MGA_REGULAR_EVENT_ID, p_room_id: room.id }, "Room deleted.") }}>Delete</button></div>
                      <p>{members.length ? members.join(" · ") : "No assigned players"}</p>
                    </article>
                  })}
                  {!rooms.length && <p className={styles.muted}>No rooms yet. Create a room for this booked time slot.</p>}
                </div></section>
              </div>
            </section>
          })}
        </div>
        <footer className={styles.publishBar}><div><strong>{publishedAt ? "Assignments are visible to players" : "Private draft"}</strong><span>{publishedAt ? "Players can see only their own published assignment." : "Review the full day before publishing."}</span></div><button className={publishedAt ? styles.secondary : styles.publish} disabled={busy} onClick={publishDay}>{publishedAt ? `Unpublish ${day.label}` : `Publish ${day.label}`}</button></footer>
        {(message || error) && <p className={error ? styles.error : styles.notice} role="status">{message || error}</p>}
      </>}
    </div>
  </main>
}
