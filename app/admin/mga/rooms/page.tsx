"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { formatMgaLocalTime, MGA_DAYS, MGA_REGULAR_EVENT_ID, type MgaDayKey, type MgaRoom, type MgaRoomSelection, type MgaRoomSnapshot } from "@/lib/mgaRegular"
import { canMoveRoomAssignment, makeMgaRoomDraft, roomAssignmentChoices, roomAssignmentConflicts, roomDraftChanged, roomSaveRegistrationIds, roomSeatsAvailable, type MgaRoomDraft } from "@/lib/mgaRoomDraft"
import { canMoveEmptyMgaRoom, sameDayEmptyRoomMoveSlots } from "@/lib/mgaEmptyRoomMove"
import { supabase } from "@/lib/supabase"
import styles from "./page.module.css"

type SlotGroup = NonNullable<MgaRoomSnapshot["players"]>[number]["selections"][number] & {
  players: MgaRoomSnapshot["players"]
}

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00Z`))
}

export default function MgaRoomAdminPage() {
  const [snapshot, setSnapshot] = useState<MgaRoomSnapshot | null>(null)
  const [dayKey, setDayKey] = useState<MgaDayKey>("thursday")
  const [capacityDraft, setCapacityDraft] = useState("4")
  const [roomDrafts, setRoomDrafts] = useState<Record<string, MgaRoomDraft>>({})
  const [moveRegistrationId, setMoveRegistrationId] = useState<string | null>(null)
  const [moveTimeSlotId, setMoveTimeSlotId] = useState("")
  const [moveRoomId, setMoveRoomId] = useState("")
  const [roomMoveDestinationIds, setRoomMoveDestinationIds] = useState<Record<string, string>>({})
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [response, moveOptions] = await Promise.all([
        supabase.rpc("mga_regular_room_admin_v1", { p_event_id: MGA_REGULAR_EVENT_ID }),
        supabase.rpc("mga_regular_room_move_options_v1", { p_event_id: MGA_REGULAR_EVENT_ID }),
      ])
      const value = Array.isArray(response.data) ? response.data[0] : response.data
      if (response.error || !value) {
        setError(response.error?.message || "The MGA room service returned no roster.")
        setSnapshot(null)
      } else {
        const loaded = value as MgaRoomSnapshot
        const moveSlots = Array.isArray(moveOptions.data) ? moveOptions.data as MgaRoomSelection[] : []
        const next: MgaRoomSnapshot = {
          ...loaded,
          time_slots: moveOptions.error ? [] : moveSlots,
          rooms: (loaded.rooms || []).map((room) => ({
            ...room,
            capacity: room.capacity || loaded.room_capacity || 4,
          })),
        }
        setSnapshot(next)
        setCapacityDraft(String(next.room_capacity || 4))
        setRoomDrafts(Object.fromEntries((next.rooms || []).map((room) => [
          room.id,
          makeMgaRoomDraft(room, next.assignments || [], next.room_capacity || 4),
        ])))
        setRoomMoveDestinationIds(Object.fromEntries((next.rooms || []).map((room) => [room.id, room.time_slot_id])))
        if (moveOptions.error) setError(`Roster loaded, but the full destination slot list is unavailable: ${moveOptions.error.message}`)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the MGA room roster.")
      setSnapshot(null)
    } finally {
      setLoading(false)
    }
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

  const dirtyRoomIds = useMemo(() => (snapshot?.rooms || [])
    .filter((room) => roomDraftChanged(room, roomDrafts[room.id] || makeMgaRoomDraft(room, snapshot?.assignments || [], snapshot?.room_capacity || 4), snapshot?.assignments || [], snapshot?.room_capacity || 4))
    .map((room) => room.id), [roomDrafts, snapshot])

  function draftFor(room: MgaRoom): MgaRoomDraft {
    return roomDrafts[room.id] || makeMgaRoomDraft(room, snapshot?.assignments || [], snapshot?.room_capacity || 4)
  }

  function patchRoomDraft(room: MgaRoom, patch: Partial<MgaRoomDraft>) {
    setRoomDrafts((current) => ({
      ...current,
      [room.id]: { ...current[room.id] || makeMgaRoomDraft(room, snapshot?.assignments || [], snapshot?.room_capacity || 4), ...patch },
    }))
    setError("")
    setMessage("")
  }

  async function perform(rpc: string, args: Record<string, unknown>, success: string) {
    setBusy(true)
    setError("")
    setMessage("")
    try {
      const response = await supabase.rpc(rpc, args)
      if (response.error) {
        setError(response.error.message)
        return false
      }
      await load()
      setMessage(success)
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The room change could not be saved.")
      return false
    } finally {
      setBusy(false)
    }
  }

  async function saveRoom(room: MgaRoom, slotPlayers: MgaRoomSnapshot["players"]) {
    const draft = draftFor(room)
    const selectedIds = roomSaveRegistrationIds(draft, slotPlayers)
      .filter((registrationId) => slotPlayers.some((player) => player.registration_id === registrationId
        && player.selections.some((selection) => selection.day_key === room.day_key && selection.time_slot_id === room.time_slot_id)))
    if (roomAssignmentConflicts(room, selectedIds, snapshot?.assignments || []).length > 0) {
      setError("One or more selected players are already assigned to another room on this day. Use Move time / room to transfer a player before saving.")
      return
    }
    if (selectedIds.length > Number(draft.capacity)) {
      setError(`Room capacity is ${draft.capacity}; reduce the selected players or increase the room capacity.`)
      return
    }
    const ok = await perform("mga_regular_room_save_v1", {
      p_event_id: MGA_REGULAR_EVENT_ID,
      p_room_id: room.id,
      p_room_name: draft.room_name,
      p_room_capacity: Number(draft.capacity),
      p_registration_ids: selectedIds,
    }, `${draft.room_name.trim()} saved.`)
    if (!ok) return
  }

  function changeAssignmentDraft(room: MgaRoom, registrationId: string, checked: boolean) {
    if (dirtyRoomIds.some((id) => id !== room.id)) {
      setError("Save the other edited room before changing this room.")
      return
    }
    const current = draftFor(room).registration_ids
    const next = checked ? [...new Set([...current, registrationId])] : current.filter((id) => id !== registrationId)
    patchRoomDraft(room, { registration_ids: next })
  }

  function openMove(playerId: string) {
    if (dirtyRoomIds.length) {
      setError("Save the edited room before moving a player to a different time slot.")
      return
    }
    const player = snapshot?.players.find((item) => item.registration_id === playerId)
    const booked = player?.selections.find((item) => item.day_key === dayKey)
    setMoveRegistrationId(playerId)
    setMoveTimeSlotId(booked?.time_slot_id || "")
    setMoveRoomId("")
    setError("")
    setMessage("")
  }

  const movePlayer = snapshot?.players.find((item) => item.registration_id === moveRegistrationId) || null
  const moveCurrentTimeSlotId = movePlayer?.selections.find((selection) => selection.day_key === dayKey)?.time_slot_id || ""
  const moveCurrentRoomId = snapshot?.assignments.find((item) => item.registration_id === moveRegistrationId && item.day_key === dayKey)?.room_id || null
  const timeSlots = (snapshot?.time_slots || snapshot?.players.flatMap((player) => player.selections) || [])
    .filter((slot) => slot.day_key === dayKey)
    .filter((slot, index, all) => all.findIndex((candidate) => candidate.time_slot_id === slot.time_slot_id) === index)
    .sort((a, b) => a.slot_number - b.slot_number)
  const destinationSlot = timeSlots.find((slot) => slot.time_slot_id === moveTimeSlotId) || null
  const destinationRooms = (snapshot?.rooms || []).filter((room) => room.day_key === dayKey && room.time_slot_id === moveTimeSlotId)
  const moveCanSave = canMoveRoomAssignment(moveCurrentTimeSlotId || null, moveCurrentRoomId, destinationSlot?.time_slot_id || null, destinationRooms.some((room) => room.id === moveRoomId) ? moveRoomId : null)

  async function createDestinationRoom() {
    if (!destinationSlot || publishedAt || dirtyRoomIds.length) return
    setBusy(true)
    setError("")
    setMessage("")
    try {
      const response = await supabase.rpc("mga_regular_room_create_v1", {
        p_event_id: MGA_REGULAR_EVENT_ID,
        p_day_key: dayKey,
        p_time_slot_id: destinationSlot.time_slot_id,
        p_room_name: null,
      })
      if (response.error) {
        setError(response.error.message)
        return
      }
      const created = Array.isArray(response.data) ? response.data[0] : response.data
      await load()
      if (created?.id) setMoveRoomId(String(created.id))
      setMessage(`${created?.room_name || "New room"} created. Confirm the move to update the player's saved time.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The destination room could not be created.")
    } finally {
      setBusy(false)
    }
  }

  async function confirmMove() {
    if (!snapshot || !movePlayer || !destinationSlot) return
    const room = moveRoomId ? destinationRooms.find((item) => item.id === moveRoomId) : null
    if (moveRoomId && !room) {
      setError("The selected room is no longer available in the destination time slot.")
      return
    }
    if (!canMoveRoomAssignment(moveCurrentTimeSlotId || null, moveCurrentRoomId, destinationSlot.time_slot_id, room?.id || null)) {
      setError("Choose a different time slot or room. A player already in this room does not need to be moved.")
      return
    }
    if (room && roomSeatsAvailable(room, snapshot.assignments, movePlayer.registration_id) < 1) {
      setError("That room has no available capacity. Choose another room or increase its capacity.")
      return
    }
    const prior = movePlayer.selections.find((selection) => selection.day_key === dayKey)
    const destination = room
      ? `in ${room.room_name} (${room.player_count}/${room.capacity} seats currently used)`
      : "and leave them unassigned to a room"
    const sameTimeSlot = destinationSlot.time_slot_id === moveCurrentTimeSlotId
    if (!window.confirm(`Move ${movePlayer.screen_name} on ${day.label} ${sameTimeSlot ? "between rooms at" : `from ${prior ? formatMgaLocalTime(prior.starts_at, "America/New_York") : "their current slot"} to`} ${formatEventDate(destinationSlot.event_date)} at ${formatMgaLocalTime(destinationSlot.starts_at, "America/New_York")} ${destination}? ${sameTimeSlot ? "The saved time stays unchanged." : "This updates only this day's authoritative saved time."} Their identity and other tournament days stay unchanged.`)) return
    const ok = await perform("mga_regular_player_move_time_slot_v1", {
      p_event_id: MGA_REGULAR_EVENT_ID,
      p_registration_id: movePlayer.registration_id,
      p_expected_canonical_player_id: movePlayer.canonical_player_id,
      p_day_key: dayKey,
      p_expected_time_slot_id: prior?.time_slot_id,
      p_destination_time_slot_id: destinationSlot.time_slot_id,
      p_destination_room_id: room?.id || null,
    }, `${movePlayer.screen_name} moved to ${formatMgaLocalTime(destinationSlot.starts_at, "America/New_York")}${room ? ` in ${room.room_name}` : " and left unassigned"}. Their saved time was updated for ${day.label}.`)
    if (ok) setMoveRegistrationId(null)
  }

  async function moveEmptyRoom(room: MgaRoom) {
    const destinationId = roomMoveDestinationIds[room.id] || room.time_slot_id
    const destination = (snapshot?.time_slots || []).find((slot) => slot.time_slot_id === destinationId)
    const destinations = sameDayEmptyRoomMoveSlots(room, snapshot?.time_slots || [])
    if (!snapshot || !destination || !destinations.some((slot) => slot.time_slot_id === destinationId)) {
      setError("Choose a different available time slot on the same tournament day.")
      return
    }
    if (!canMoveEmptyMgaRoom(room, Boolean(publishedAt)) || dirtyRoomIds.length > 0) {
      setError("Only a saved, empty, unpublished room on an unpublished day can be moved.")
      return
    }
    const confirmed = window.confirm(
      `Move ${room.room_name} (room number ${room.room_number}) to ${formatEventDate(destination.event_date)}, Time Slot ${destination.slot_number} at ${formatMgaLocalTime(destination.starts_at, "America/New_York")} Eastern? The room ID, number, name, capacity, assignments, registrations, and counter will not change.`,
    )
    if (!confirmed) return
    await perform("mga_regular_room_move_empty_v1", {
      p_event_id: MGA_REGULAR_EVENT_ID,
      p_room_id: room.id,
      p_destination_time_slot_id: destination.time_slot_id,
    }, `${room.room_name} moved to Time Slot ${destination.slot_number}. Its number and identity were preserved.`)
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
      <nav className={styles.nav}><Link href="/admin/majors">← Four Majors</Link><Link href="/admin/mga/live">Live rooms / OBS</Link><Link href="/admin/mga/scoring">Scorecard review</Link><Link href="/admin/mga/discord">Discord notices</Link><Link href="/mga">Player MGA page</Link></nav>
      <header className={styles.hero}><p className={styles.eyebrow}>Main site · Four Majors</p><h1>MGA Championship Rooms</h1><p>Organize the existing MGA roster by its saved Thursday–Sunday booking times. Room changes never alter a booked time unless an Admin confirms a time-slot move.</p></header>
      {loading && <p className={styles.notice} role="status">Loading the authoritative MGA registration roster…</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {snapshot && <>
        <section className={styles.controls}>
          <div><strong>{snapshot.players.length} registered players</strong><span> · {snapshot.assignments.length} room assignments saved</span></div>
          <label>Default capacity for new rooms
            <input type="number" min={1} max={100} value={capacityDraft} onChange={(event) => setCapacityDraft(event.target.value)} />
          </label>
          <button disabled={busy || dirtyRoomIds.length > 0 || !Number.isInteger(Number(capacityDraft)) || Number(capacityDraft) < 1 || Number(capacityDraft) > 100} onClick={() => void perform("mga_regular_room_capacity_v1", { p_event_id: MGA_REGULAR_EVENT_ID, p_room_capacity: Number(capacityDraft) }, "Default capacity for new rooms saved.")}>Save default</button>
          <button className={styles.secondary} disabled={busy || dirtyRoomIds.length > 0} onClick={() => void load()}>Refresh roster</button>
        </section>
        <div className={styles.dayTabs} role="tablist" aria-label="Tournament day">
          {MGA_DAYS.map((item) => <button key={item.key} role="tab" aria-selected={dayKey === item.key} className={dayKey === item.key ? styles.selectedTab : ""} disabled={busy || dirtyRoomIds.length > 0} onClick={() => setDayKey(item.key)}>{item.label}</button>)}
        </div>
        <p className={styles.privacy}>{publishedAt ? `Published ${new Date(publishedAt).toLocaleString()}. Unpublish before changing rooms or time slots.` : "Draft assignments are private to authorized Admins."}</p>
        {slotGroups.length === 0 && <section className={styles.panel}>No registered players have a saved {day.label} selection.</section>}
        <div className={styles.slots}>
          {slotGroups.map((slot) => {
            const rooms = snapshot.rooms.filter((item) => item.day_key === dayKey && item.time_slot_id === slot.time_slot_id)
            return <section className={styles.slot} key={slot.time_slot_id}>
              <header className={styles.slotHeading}>
                <div><p className={styles.eyebrow}>{day.label} · Time Slot {slot.slot_number}</p><h2>{slot.course_name || "Gardens of Babylon"}</h2><p>{formatMgaLocalTime(slot.starts_at, "America/New_York")} · Eastern event time</p></div>
                <button disabled={busy || Boolean(publishedAt) || dirtyRoomIds.length > 0} onClick={() => void perform("mga_regular_room_create_v1", { p_event_id: MGA_REGULAR_EVENT_ID, p_day_key: dayKey, p_time_slot_id: slot.time_slot_id, p_room_name: null }, `KMGA${snapshot.next_room_number} created.`)}>Create KMGA{snapshot.next_room_number}</button>
              </header>
              <section className={styles.bookedPlayers}><h3>Booked players <span>{slot.players.length}</span></h3><div className={styles.playerList}>
                {slot.players.map((player) => {
                  const assigned = snapshot.assignments.find((item) => item.registration_id === player.registration_id && item.day_key === dayKey)
                  const assignedRoom = rooms.find((room) => room.id === assigned?.room_id)
                  return <div className={styles.playerRow} key={player.registration_id}>
                    <div><strong>{player.screen_name}</strong><span>{formatMgaLocalTime(slot.starts_at, player.player_time_zone)} · {player.player_time_zone}</span><span>{assignedRoom ? `Saved room: ${assignedRoom.room_name}` : "Not assigned to a room"}</span></div>
                    <button className={styles.moveButton} disabled={busy || Boolean(publishedAt) || dirtyRoomIds.length > 0} onClick={() => openMove(player.registration_id)}>Move time / room</button>
                  </div>
                })}
              </div></section>
              <section className={styles.roomSection}><h3>Rooms <span>{rooms.length}</span></h3><div className={styles.roomList}>
                {rooms.map((room) => {
                  const draft = draftFor(room)
                  const roomPublishedAt = room.published_at || publishedAt
                  const roomLocked = Boolean(roomPublishedAt)
                  const roomMoveSlots = sameDayEmptyRoomMoveSlots(room, snapshot.time_slots || [])
                  const roomMoveEligible = canMoveEmptyMgaRoom(room, Boolean(publishedAt))
                  const selectedIds = new Set(draft.registration_ids)
                  const changed = roomDraftChanged(room, draft, snapshot.assignments, snapshot.room_capacity || 4)
                  const otherRoomDirty = dirtyRoomIds.some((id) => id !== room.id)
                  const capacity = Number(draft.capacity)
                  const saveIds = roomSaveRegistrationIds(draft, slot.players)
                  const capacityValid = Number.isInteger(capacity) && capacity >= 1 && capacity <= 100 && saveIds.length <= capacity
                  return <article className={styles.roomCard} key={room.id}>
                    <div className={styles.roomHeader}><strong>{room.room_name}</strong><span>Saved {room.player_count}/{room.capacity}</span></div>
                    <div className={styles.roomEditor}>
                      <label>Room name<input aria-label={`Room name ${room.room_name}`} maxLength={40} value={draft.room_name} disabled={busy || roomLocked || otherRoomDirty} onChange={(event) => patchRoomDraft(room, { room_name: event.target.value })} /></label>
                      <label>Capacity<input aria-label={`Capacity for ${room.room_name}`} type="number" min={1} max={100} value={draft.capacity} disabled={busy || roomLocked || otherRoomDirty} onChange={(event) => patchRoomDraft(room, { capacity: event.target.value })} /></label>
                    </div>
                    {roomMoveEligible && roomMoveSlots.length > 0 && <div className={styles.roomMove}>
                      <label>
                        Move empty room to time slot
                        <select
                          aria-label={`Move ${room.room_name} to time slot`}
                          value={roomMoveDestinationIds[room.id] || room.time_slot_id}
                          disabled={busy || dirtyRoomIds.length > 0}
                          onChange={(event) => setRoomMoveDestinationIds((current) => ({ ...current, [room.id]: event.target.value }))}
                        >
                          <option value={room.time_slot_id}>Current · Time Slot {slot.slot_number} · {formatMgaLocalTime(slot.starts_at, "America/New_York")} ET</option>
                          {roomMoveSlots.map((destination) => <option key={destination.time_slot_id} value={destination.time_slot_id}>
                            Time Slot {destination.slot_number} · {formatMgaLocalTime(destination.starts_at, "America/New_York")} ET
                          </option>)}
                        </select>
                      </label>
                      <button
                        className={styles.secondary}
                        disabled={busy || dirtyRoomIds.length > 0 || (roomMoveDestinationIds[room.id] || room.time_slot_id) === room.time_slot_id}
                        onClick={() => void moveEmptyRoom(room)}
                      >Move Room to Time Slot</button>
                    </div>}
                    {roomMoveEligible && roomMoveSlots.length === 0 && <p className={styles.muted}>No other available time slots on this day.</p>}
                    <fieldset className={styles.memberPicker} disabled={busy || roomLocked || otherRoomDirty}>
                      <legend>Assigned players · Draft {saveIds.length}/{Number.isFinite(capacity) ? capacity : "—"}</legend>
                      {roomAssignmentChoices(room, slot.players, snapshot.assignments).map((player) => <label key={player.registration_id}>
                        <input type="checkbox" checked={selectedIds.has(player.registration_id)} onChange={(event) => changeAssignmentDraft(room, player.registration_id, event.target.checked)} />
                        <span>{player.screen_name}</span>
                      </label>)}
                    </fieldset>
                    {changed && <p className={styles.unsaved} role="status">Unsaved changes</p>}
                    {saveIds.length > capacity && <p className={styles.error}>Selected players exceed this room’s capacity.</p>}
                    <div className={styles.roomActions}>
                      <button disabled={busy || roomLocked || otherRoomDirty || !changed || !capacityValid || draft.room_name.trim().length < 2 || draft.room_name.trim().length > 40} onClick={() => void saveRoom(room, slot.players)}>Save Room</button>
                      <button className={roomPublishedAt ? styles.secondary : styles.publish} disabled={busy || Boolean(publishedAt) || dirtyRoomIds.length > 0 || (!roomPublishedAt && saveIds.length === 0)} onClick={() => {
                        const action = roomPublishedAt ? "unpublish_room_v1" : "publish_room_v1"
                        const question = roomPublishedAt
                          ? `Unpublish ${room.room_name} and hide only this room's assignments from its players?`
                          : `Publish ${room.room_name} and show its assignments only to those players? Other rooms remain private drafts.`
                        if (window.confirm(question)) void perform(action === "publish_room_v1" ? "mga_regular_room_publish_v1" : "mga_regular_room_unpublish_v1", { p_event_id: MGA_REGULAR_EVENT_ID, p_room_id: room.id }, roomPublishedAt ? `${room.room_name} returned to draft.` : `${room.room_name} published to its assigned players.`)
                      }}>{publishedAt ? `Published with ${day.label}` : room.published_at ? "Unpublish Room" : "Publish Room"}</button>
                      <button className={styles.danger} disabled={busy || roomLocked || dirtyRoomIds.length > 0 || room.player_count > 0} onClick={() => { if (window.confirm(`Delete empty room ${room.room_name}?`)) void perform("mga_regular_room_delete_v1", { p_event_id: MGA_REGULAR_EVENT_ID, p_room_id: room.id }, "Room deleted.") }}>Delete</button>
                    </div>
                    <p className={roomPublishedAt ? styles.notice : styles.muted}>{roomPublishedAt ? `Published ${new Date(roomPublishedAt).toLocaleString()}` : changed ? "Unsaved changes · save this room before publishing" : "Saved draft · private to Admins"}</p>
                  </article>
                })}
                {!rooms.length && <p className={styles.muted}>No rooms yet. Create a room for this booked time slot.</p>}
              </div></section>
            </section>
          })}
        </div>
        <footer className={styles.publishBar}><div><strong>{publishedAt ? "Assignments are visible to players" : "Private draft"}</strong><span>{publishedAt ? "Players can see only their own published assignment." : "Review the full day before publishing."}</span></div><button className={publishedAt ? styles.secondary : styles.publish} disabled={busy || dirtyRoomIds.length > 0} onClick={publishDay}>{publishedAt ? `Unpublish ${day.label}` : `Publish ${day.label}`}</button></footer>
        {(message || error) && <p className={error ? styles.error : styles.notice} role="status">{message || error}</p>}
      </>}
      {movePlayer && <div className={styles.dialogBackdrop} role="presentation"><section className={styles.moveDialog} role="dialog" aria-modal="true" aria-labelledby="move-title">
        <h2 id="move-title">Move {movePlayer.screen_name}</h2>
        <p>Move {movePlayer.screen_name} to another room or time on {day.label}. A room-only move keeps the booked time unchanged; other tournament days remain unchanged.</p>
        <label>Destination date and time
          <select value={moveTimeSlotId} disabled={busy || Boolean(publishedAt)} onChange={(event) => { setMoveTimeSlotId(event.target.value); setMoveRoomId("") }}>
            {timeSlots.map((slot) => <option key={slot.time_slot_id} value={slot.time_slot_id}>{formatEventDate(slot.event_date)} · {formatMgaLocalTime(slot.starts_at, "America/New_York")} · Slot {slot.slot_number}</option>)}
          </select>
        </label>
        {destinationSlot && <div className={styles.destinationSummary}><strong>{formatEventDate(destinationSlot.event_date)}</strong><span>{formatMgaLocalTime(destinationSlot.starts_at, "America/New_York")} · Time Slot {destinationSlot.slot_number}</span></div>}
        <label>Destination room
          <select value={moveRoomId} disabled={busy || Boolean(publishedAt)} onChange={(event) => setMoveRoomId(event.target.value)}>
            <option value="">Leave unassigned</option>
            {destinationRooms.map((room) => {
              const available = roomSeatsAvailable(room, snapshot?.assignments || [], movePlayer.registration_id)
              return <option key={room.id} value={room.id} disabled={available < 1}>{room.room_name} · {Math.max(0, room.capacity - available)}/{room.capacity} used · {available} available</option>
            })}
          </select>
        </label>
        {destinationRooms.length === 0 && <p className={styles.muted}>No room exists for this time yet.</p>}
        <div className={styles.dialogActions}>
          <button className={styles.secondary} disabled={busy || Boolean(publishedAt) || dirtyRoomIds.length > 0 || !destinationSlot || destinationSlot.time_slot_id === moveCurrentTimeSlotId} onClick={() => void createDestinationRoom()}>Create destination room</button>
          <button disabled={busy || Boolean(publishedAt) || !destinationSlot || !moveCanSave} onClick={() => void confirmMove()}>Confirm move</button>
          <button className={styles.secondary} disabled={busy} onClick={() => setMoveRegistrationId(null)}>Cancel</button>
        </div>
      </section></div>}
    </div>
  </main>
}
