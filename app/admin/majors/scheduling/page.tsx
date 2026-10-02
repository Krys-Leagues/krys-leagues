"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { MajorAdminWorkspaceLink } from "@/components/admin/majors/MajorAdminWorkspaceLink"
import { majorAdminRouteContext } from "@/lib/majorAdminSelection"
import {
  isMajorDayLocked,
  majorEventLocalTimeToIso,
  toDateTimeLocal,
  toMajorEventTimeInput,
  type MajorDayChoice,
  type MajorEntry,
  type MajorEvent,
  type MajorFinalPlacement,
  type MajorPlayDay,
  type MajorScheduleGroup,
  type MajorScheduleGroupMember,
  type MajorStandardSignupTime,
  type MajorTestTester,
  type MajorTimeSlot,
  type MajorWeekendStatus,
} from "@/lib/majors"
import { isActiveMajorEntryStatus } from "@/lib/majorEntryParticipation"
import { formatMastersAdminDateTime, formatMastersAdminTime, formatMastersOfficialDate, mastersAdminTimeZoneLabel } from "@/lib/mastersSignupDisplay"
import { isInstructionOnlyPublishedRoomRepublish, validateMastersRoomPlayerIds } from "@/lib/mastersRoomScheduling"
import {
  globalPlayerIdentitySummary,
  globalPlayerMatchesSearch,
  loadProtectedAdminGlobalPlayers,
  type ProtectedAdminGlobalPlayer,
} from "@/lib/identity/adminGlobalPlayerClient"
import { supabase } from "@/lib/supabase"
import styles from "./page.module.css"

type AdminSection = "setup" | `day-${1 | 2 | 3 | 4}` | "weekend" | "results" | "testers"

const DAY_NAMES = [
  { short: "Thursday", title: "Thursday — Round 1", fallback: "Round 1" },
  { short: "Friday", title: "Friday — Round 2", fallback: "Round 2" },
  { short: "Saturday", title: "Saturday — Round 3", fallback: "Round 3" },
  { short: "Sunday", title: "Sunday — Final Round", fallback: "Final Round" },
] as const

export default function MajorSchedulingAdminPage() {
  const [events, setEvents] = useState<MajorEvent[]>([])
  const [eventId, setEventId] = useState("")
  const [workspaceEventId, setWorkspaceEventId] = useState("")
  const [activeSection, setActiveSection] = useState<AdminSection>("setup")
  const [days, setDays] = useState<MajorPlayDay[]>([])
  const [slots, setSlots] = useState<MajorTimeSlot[]>([])
  const [standardTimes, setStandardTimes] = useState<MajorStandardSignupTime[]>([])
  const [entries, setEntries] = useState<MajorEntry[]>([])
  const [choices, setChoices] = useState<MajorDayChoice[]>([])
  const [weekend, setWeekend] = useState<MajorWeekendStatus[]>([])
  const [groups, setGroups] = useState<MajorScheduleGroup[]>([])
  const [members, setMembers] = useState<MajorScheduleGroupMember[]>([])
  const [placements, setPlacements] = useState<MajorFinalPlacement[]>([])
  const [testers, setTesters] = useState<MajorTestTester[]>([])
  const [globalPlayers, setGlobalPlayers] = useState<ProtectedAdminGlobalPlayer[]>([])
  const [message, setMessage] = useState("")
  const selectedEvent = events.find((event) => event.id === eventId)

  const loadSchedule = useCallback(async (id: string, preferredPlayDayId?: string) => {
    if (!id) return
    const dayResult = await supabase.from("major_play_days").select("*").eq("major_event_id", id).order("day_number")
    const loadedDays = (dayResult.data as MajorPlayDay[] | null) || []
    const dayIds = loadedDays.map((day) => day.id)
    const [slotResult, standardTimeResult, entryResult, weekendResult, groupResult, placementResult, testerResult] = await Promise.all([
      dayIds.length ? supabase.from("major_time_slots").select("*").in("play_day_id", dayIds).order("starts_at") : Promise.resolve({ data: [], error: null }),
      supabase.from("major_standard_signup_times").select("*").eq("major_event_id", id).eq("is_active", true).order("local_time"),
      supabase.from("major_entries").select("*").eq("major_event_id", id).order("player_screen_name_snapshot"),
      supabase.from("major_entry_weekend_status").select("*").eq("major_event_id", id),
      supabase.from("major_schedule_groups").select("*").eq("major_event_id", id).order("group_label"),
      supabase.from("major_final_placements").select("*").eq("major_event_id", id),
      supabase.rpc("get_major_test_testers", { p_major_event_id: id }),
    ])
    const loadedEntries = (entryResult.data as MajorEntry[] | null) || []
    const loadedGroups = (groupResult.data as MajorScheduleGroup[] | null) || []
    const [choiceResult, memberResult] = await Promise.all([
      loadedEntries.length ? supabase.from("major_entry_day_choices").select("*").in("entry_id", loadedEntries.map((entry) => entry.id)) : Promise.resolve({ data: [], error: null }),
      loadedGroups.length ? supabase.from("major_schedule_group_members").select("*").in("group_id", loadedGroups.map((group) => group.id)) : Promise.resolve({ data: [], error: null }),
    ])
    setDays(loadedDays)
    setSlots((slotResult.data as MajorTimeSlot[] | null) || [])
    setStandardTimes((standardTimeResult.data as MajorStandardSignupTime[] | null) || [])
    setEntries(loadedEntries)
    setChoices((choiceResult.data as MajorDayChoice[] | null) || [])
    setWeekend((weekendResult.data as MajorWeekendStatus[] | null) || [])
    setGroups(loadedGroups)
    setMembers((memberResult.data as MajorScheduleGroupMember[] | null) || [])
    setPlacements((placementResult.data as MajorFinalPlacement[] | null) || [])
    setTesters((testerResult.data as MajorTestTester[] | null) || [])
    if (preferredPlayDayId) {
      const requestedDay = loadedDays.find((day) => day.id === preferredPlayDayId && day.day_number >= 1 && day.day_number <= 4)
      if (requestedDay) setActiveSection(`day-${requestedDay.day_number as 1 | 2 | 3 | 4}`)
    }
    setMessage(dayResult.error?.message || slotResult.error?.message || standardTimeResult.error?.message || entryResult.error?.message || choiceResult.error?.message || weekendResult.error?.message || groupResult.error?.message || memberResult.error?.message || placementResult.error?.message || testerResult.error?.message || "")
  }, [])

  const reloadEvents = useCallback(async (preferred?: string) => {
    const [result, playerDirectoryResult] = await Promise.all([
      supabase.from("major_events").select("*").order("slug"),
      loadProtectedAdminGlobalPlayers()
        .then((data) => ({ data, error: null }))
        .catch((error: Error) => ({ data: [], error })),
    ])
    const loaded = (result.data as MajorEvent[] | null) || []
    const routeContext = majorAdminRouteContext(window.location.search)
    const contextEventId = routeContext.eventId
    const requested = preferred || contextEventId
    const next = loaded.some((event) => event.id === requested) ? requested! : loaded[0]?.id || ""
    setEvents(loaded)
    setGlobalPlayers(playerDirectoryResult.data)
    setWorkspaceEventId(loaded.some((event) => event.id === contextEventId) ? contextEventId! : "")
    if (playerDirectoryResult.error) setMessage(playerDirectoryResult.error.message)
    setEventId(next)
    if (next) await loadSchedule(next, routeContext.playDayId)
  }, [loadSchedule])

  useEffect(() => {
    // Initial client-side Supabase synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reloadEvents()
  }, [reloadEvents])

  const choicesBySlot = useMemo(
    () => new Map(slots.map((slot) => [slot.id, choices.filter((choice) => choice.time_slot_id === slot.id)])),
    [choices, slots],
  )

  function showResult(error: { message: string } | null, success: string) {
    setMessage(error?.message || success)
    return !error
  }

  function selectSection(section: AdminSection) {
    setActiveSection(section)
    const params = new URLSearchParams(window.location.search)
    if (eventId) params.set("event", eventId)
    const dayNumber = section.startsWith("day-") ? Number(section.slice(4)) : null
    const selectedDay = dayNumber ? days.find((day) => day.day_number === dayNumber) : null
    if (selectedDay) params.set("playDay", selectedDay.id)
    else params.delete("playDay")
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`)
  }

  function selectEvent(nextEventId: string) {
    setEventId(nextEventId)
    setActiveSection("setup")
    const params = new URLSearchParams({ event: nextEventId })
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`)
    void loadSchedule(nextEventId)
  }

  async function saveOpening(form: HTMLFormElement) {
    const data = new FormData(form)
    const result = await supabase.rpc("configure_major_signup_release", {
      p_major_event_id: eventId,
      p_release_1_capacity: Number(data.get("capacity")),
      p_public_signup_opens_at: data.get("public_open") ? new Date(String(data.get("public_open"))).toISOString() : null,
      p_minimum_public_spots_at_open: data.get("public_minimum") ? Number(data.get("public_minimum")) : null,
      p_priority_signup_enabled: data.get("priority_enabled") === "on",
      p_priority_signup_opens_at: data.get("priority_open") ? new Date(String(data.get("priority_open"))).toISOString() : null,
      p_priority_source_event_id: data.get("priority_source") ? String(data.get("priority_source")) : null,
      p_schedule_timezone: String(data.get("timezone")),
    })
    if (showResult(result.error, "Signup opening settings saved.")) await reloadEvents(eventId)
  }

  async function saveLockHours(form: HTMLFormElement) {
    const hours = Number(new FormData(form).get("lock_hours"))
    const result = await supabase.rpc("set_major_schedule_lock_hours", { p_major_event_id: eventId, p_hours_before_first_slot: hours })
    if (showResult(result.error, `Player changes now lock ${hours} hours before each day's first time.`)) await reloadEvents(eventId)
  }

  async function releaseSpots(form: HTMLFormElement) {
    const amount = Number(new FormData(form).get("release"))
    const result = await supabase.rpc("release_additional_major_spots", { p_major_event_id: eventId, p_additional_spots: amount })
    if (showResult(result.error, `${amount} additional spots released. No third release is available.`)) await reloadEvents(eventId)
  }

  async function saveDay(dayNumber: number, form: HTMLFormElement) {
    const data = new FormData(form)
    const existing = days.find((day) => day.day_number === dayNumber)
    const row = {
      ...(existing ? { id: existing.id } : {}),
      major_event_id: eventId,
      day_number: dayNumber,
      label: String(data.get("label")),
      play_date: String(data.get("date")),
      choices_locked: data.get("locked") === "on",
    }
    const result = await supabase.from("major_play_days").upsert(row, { onConflict: "major_event_id,day_number" })
    if (showResult(result.error, `${DAY_NAMES[dayNumber - 1].short} settings saved.`)) await loadSchedule(eventId)
  }

  async function saveStandardTime(form: HTMLFormElement, standardTime?: MajorStandardSignupTime) {
    const data = new FormData(form)
    const result = await supabase.rpc("save_major_standard_signup_time", {
      p_id: standardTime?.id || null,
      p_major_event_id: eventId,
      p_local_time: String(data.get("time")),
      p_label: String(data.get("label") || ""),
    })
    if (showResult(result.error, standardTime ? "Standard signup time updated. Apply the template when you are ready to update the four days." : "Standard signup time added. Apply the template when you are ready.")) {
      form.reset()
      await loadSchedule(eventId)
    }
  }

  async function removeStandardTime(standardTime: MajorStandardSignupTime) {
    if (!window.confirm("Remove this time from the standard template? Day slots will not change until you apply the template. Selected day slots will be preserved and disabled rather than deleted.")) return
    const result = await supabase.rpc("remove_major_standard_signup_time", { p_id: standardTime.id, p_major_event_id: eventId })
    if (showResult(result.error, "Time removed from the template. Apply the template to retire its unused day slots safely.")) await loadSchedule(eventId)
  }

  async function copyThursdayTimes() {
    const result = await supabase.rpc("copy_major_thursday_times_to_standard", { p_major_event_id: eventId })
    const count = Number(result.data || 0)
    if (showResult(result.error, count ? `${count} Thursday signup time${count === 1 ? " was" : "s were"} added to the standard template.` : "Thursday's available times are already in the standard template.")) await loadSchedule(eventId)
  }

  async function applyStandardTimes() {
    if (!window.confirm("Apply the standard times to all four days? Independent day overrides stay untouched. Any selected template slot that must be replaced will be disabled and preserved.")) return
    const result = await supabase.rpc("apply_major_standard_signup_times", { p_major_event_id: eventId })
    const summary = result.data as { created?: number; updated?: number; linked_existing?: number; removed_unused?: number; protected_disabled?: number } | null
    const protectedCount = summary?.protected_disabled || 0
    const success = `Standard times applied to all four days. ${summary?.created || 0} created, ${summary?.updated || 0} updated, ${summary?.linked_existing || 0} existing linked, ${summary?.removed_unused || 0} unused removed.${protectedCount ? ` ${protectedCount} selected or room-linked slot${protectedCount === 1 ? " was" : "s were"} preserved and disabled.` : ""}`
    if (showResult(result.error, success)) await loadSchedule(eventId)
  }

  async function addSlot(day: MajorPlayDay, form: HTMLFormElement) {
    const data = new FormData(form)
    const localStartsAt = `${day.play_date}T${String(data.get("time"))}`
    const result = await supabase.rpc("create_major_time_slot", { p_play_day_id: day.id, p_local_starts_at: localStartsAt, p_label: String(data.get("label") || "") })
    if (showResult(result.error, "Time added and the lock deadline recalculated.")) {
      form.reset()
      await loadSchedule(eventId)
    }
  }

  async function editSlot(slot: MajorTimeSlot, form: HTMLFormElement) {
    if (!selectedEvent) return
    const day = days.find((item) => item.id === slot.play_day_id)
    if (!day) {
      setMessage("The official tournament day could not be found. Save the day in Event Setup before editing times.")
      return
    }
    const data = new FormData(form)
    try {
      const startsAt = majorEventLocalTimeToIso(`${day.play_date}T${String(data.get("time"))}`, selectedEvent.schedule_timezone)
      const selectedCount = choices.filter((choice) => choice.time_slot_id === slot.id).length
      if (startsAt !== slot.starts_at && selectedCount > 0 && !window.confirm(`${selectedCount} ${selectedCount === 1 ? "player has" : "players have"} selected this time. Editing it keeps them in this slot at the new time. Continue?`)) return
      const result = await supabase.from("major_time_slots").update({ starts_at: startsAt, label: String(data.get("label") || "").trim() || null, standard_signup_time_id: null }).eq("id", slot.id)
      if (showResult(result.error, "Signup time updated and the day lock deadline recalculated.")) await loadSchedule(eventId)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not convert that event-local time.")
    }
  }

  async function setSlotAvailability(slot: MajorTimeSlot, available: boolean, playerCount: number) {
    if (!available && playerCount > 0 && !window.confirm(`${playerCount} ${playerCount === 1 ? "player has" : "players have"} selected this time. Disabling it preserves their selections, but they must be moved with the administrator override. Disable it?`)) return
    const result = await supabase.from("major_time_slots").update({ is_available: available, standard_signup_time_id: null }).eq("id", slot.id)
    if (showResult(result.error, available ? "Signup time enabled and available to players." : "Signup time disabled. Existing selections were preserved.")) await loadSchedule(eventId)
  }

  async function removeSlot(slot: MajorTimeSlot, playerCount: number, roomCount: number) {
    if (playerCount || roomCount) {
      setMessage(`This time cannot be removed because it has ${playerCount} player selection${playerCount === 1 ? "" : "s"} and ${roomCount} room record${roomCount === 1 ? "" : "s"}. Move the players and remove the rooms first; otherwise disable the time to preserve its history.`)
      return
    }
    if (!window.confirm("Remove this unused signup time? This cannot be undone.")) return
    const result = await supabase.from("major_time_slots").delete().eq("id", slot.id)
    if (showResult(result.error, "Unused signup time removed and the day lock deadline recalculated.")) await loadSchedule(eventId)
  }

  async function movePlayer(entryId: string, dayId: string, slotId: string) {
    if (!slotId) return
    const result = await supabase.rpc("admin_set_major_day_choice", { p_entry_id: entryId, p_play_day_id: dayId, p_time_slot_id: slotId })
    if (showResult(result.error, "Player time updated with administrator override.")) await loadSchedule(eventId)
  }

  async function saveGroup(slot: MajorTimeSlot, form: HTMLFormElement, group: MajorScheduleGroup | null, publish: boolean) {
    const data = new FormData(form)
    const day = days.find((item) => item.id === slot.play_day_id)
    if (!day) return
    const entryIds = data.getAll("entry").map(String)
    const finalized = data.get("finalized") === "on"
    const rosterError = validateMastersRoomPlayerIds(entryIds, { finalized, published: publish })
    if (rosterError) {
      setMessage(rosterError)
      return
    }
    const roomLabel = String(data.get("label")).trim()
    const competition = String(data.get("competition"))
    const location = String(data.get("location") || "")
    const instructions = String(data.get("instructions") || "")
    const adminNotes = String(data.get("notes") || "")
    if (groups.some((item) => item.play_day_id === day.id && item.id !== group?.id && item.group_label.toLocaleLowerCase() === roomLabel.toLocaleLowerCase())) {
      setMessage(`${roomLabel} is already used on ${DAY_NAMES[day.day_number - 1].short}. Choose a different room label.`)
      return
    }
    const currentEntryIds = group ? members.filter((member) => member.group_id === group.id).map((member) => member.entry_id) : []
    if (group && isInstructionOnlyPublishedRoomRepublish({
      groupLabel: group.group_label,
      competition: group.competition,
      location: group.location,
      instructions: group.instructions,
      adminNotes: group.admin_notes,
      finalized: group.is_finalized,
      published: group.is_published,
      entryIds: currentEntryIds,
    }, {
      groupLabel: roomLabel,
      competition,
      location,
      instructions,
      adminNotes,
      finalized,
      published: publish,
      entryIds,
    })) {
      const instructionResult = await supabase.rpc("republish_major_schedule_group_instructions", {
        p_group_id: group.id,
        p_instructions: instructions,
      })
      if (showResult(instructionResult.error, `${roomLabel} instructions republished without changing players or times.`)) await loadSchedule(eventId)
      return
    }

    const result = await supabase.rpc("save_major_schedule_group", {
      p_id: group?.id || null,
      p_major_event_id: eventId,
      p_play_day_id: day.id,
      p_time_slot_id: slot.id,
      p_group_label: roomLabel,
      p_competition: competition,
      p_location: location,
      p_instructions: instructions,
      p_admin_notes: adminNotes,
      p_is_finalized: finalized,
      p_is_published: publish,
      p_entry_ids: entryIds,
    })
    if (showResult(result.error, publish ? `${data.get("label")} published to assigned players.` : `${data.get("label")} saved privately.`)) await loadSchedule(eventId)
  }

  async function publishDay(day: MajorPlayDay) {
    const dayGroups = groups.filter((group) => group.play_day_id === day.id)
    if (!dayGroups.length) {
      setMessage(`Create at least one ${DAY_NAMES[day.day_number - 1].short} room before publishing.`)
      return
    }
    for (const group of dayGroups) {
      const result = await supabase.rpc("save_major_schedule_group", {
        p_id: group.id,
        p_major_event_id: group.major_event_id,
        p_play_day_id: group.play_day_id,
        p_time_slot_id: group.time_slot_id,
        p_group_label: group.group_label,
        p_competition: group.competition,
        p_location: group.location || "",
        p_instructions: group.instructions || "",
        p_admin_notes: group.admin_notes || "",
        p_is_finalized: group.is_finalized,
        p_is_published: true,
        p_entry_ids: members.filter((member) => member.group_id === group.id).map((member) => member.entry_id),
      })
      if (result.error) {
        setMessage(`${group.group_label} was not published: ${result.error.message}`)
        await loadSchedule(eventId)
        return
      }
    }
    setMessage(`${DAY_NAMES[day.day_number - 1].short} rooms published to assigned players.`)
    await loadSchedule(eventId)
  }

  async function deleteGroup(id: string) {
    if (!window.confirm("Delete this room? Its players will return to the unassigned list for this time.")) return
    const result = await supabase.rpc("delete_major_schedule_group", { p_group_id: id })
    if (showResult(result.error, "Room deleted.")) await loadSchedule(eventId)
  }

  async function setWeekendStatus(entryId: string, status: MajorWeekendStatus["competition_status"]) {
    const result = await supabase.rpc("set_major_weekend_status", { p_entry_id: entryId, p_status: status })
    if (showResult(result.error, "Private weekend decision saved. Player times remain unchanged.")) await loadSchedule(eventId)
  }

  async function publishWeekendField() {
    if (!window.confirm("Publish all staged Main / Secondary decisions and eligible weekend rooms to players now?")) return
    const result = await supabase.rpc("publish_major_weekend_field", { p_major_event_id: eventId })
    if (showResult(result.error, "Weekend field published. Players can now see their field and published weekend rooms.")) await reloadEvents(eventId)
  }

  async function savePlacement(entryId: string, form: HTMLFormElement) {
    const data = new FormData(form)
    const placementValue = String(data.get("placement") || "")
    const result = await supabase.rpc("save_major_final_placement", {
      p_entry_id: entryId,
      p_weekend_field: String(data.get("field")),
      p_field_placement: placementValue ? Number(placementValue) : null,
      p_result_status: String(data.get("result_status")),
      p_is_tied: data.get("tied") === "on",
      p_is_winner: data.get("winner") === "on",
      p_finalize: data.get("finalize") === "on",
    })
    if (showResult(result.error, "Major result saved.")) await loadSchedule(eventId)
  }

  async function saveInformation(form: HTMLFormElement) {
    const data = new FormData(form)
    const value = (name: string) => String(data.get(name) || "")
    const result = await supabase.rpc("save_major_event_information", {
      p_major_event_id: eventId,
      p_signup_instructions: value("signup"),
      p_scheduling_instructions: value("scheduling"),
      p_qualifier_information: value("qualifier"),
      p_cut_information: value("cut"),
      p_weekend_information: value("weekend"),
      p_room_rules: value("rooms"),
      p_stream_information: value("stream"),
      p_secondary_trophy_display_name: value("secondary_trophy_name"),
    })
    if (showResult(result.error, "Tournament information saved.")) await reloadEvents(eventId)
  }

  async function addTester(playerId: string) {
    const result = await supabase.rpc("add_major_test_tester", { p_major_event_id: eventId, p_player_id: playerId })
    const saved = showResult(result.error, "Trusted TEST player added from Global Players.")
    if (saved) await loadSchedule(eventId)
    return saved
  }

  async function removeTester(playerId: string) {
    const result = await supabase.rpc("remove_major_test_tester", { p_major_event_id: eventId, p_player_id: playerId })
    if (showResult(result.error, "Trusted TEST player removed. Existing TEST history was preserved.")) await loadSchedule(eventId)
  }

  async function setTestListing(listed: boolean) {
    const result = await supabase.rpc("set_major_test_event_listing", { p_major_event_id: eventId, p_listed: listed })
    if (showResult(result.error, listed ? "TEST event listed for trusted testers." : "TEST event hidden from the Majors listing.")) await reloadEvents(eventId)
  }

  const navigation: Array<{ id: AdminSection; label: string }> = [
    { id: "setup", label: "1. Event setup" },
    ...DAY_NAMES.map((day, index) => ({ id: `day-${index + 1}` as AdminSection, label: `${index + 2}. ${day.title}` })),
    { id: "weekend", label: "6. Weekend field" },
    { id: "results", label: "7. Results" },
    ...(selectedEvent?.is_test_event ? [{ id: "testers" as AdminSection, label: "8. Testers" }] : []),
  ]

  const activeDayNumber = activeSection.startsWith("day-") ? Number(activeSection.slice(4)) : null
  const activeDay = activeDayNumber ? days.find((day) => day.day_number === activeDayNumber) : undefined

  return <main className={styles.page}>
    <div className={styles.shell}>
      <MajorAdminWorkspaceLink className={styles.backLink}>← Major workspace</MajorAdminWorkspaceLink>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>Krys Leagues tournament control</p><h1>Major schedule & rooms</h1><p>Setup → Day → Times → Players → Rooms → Publish</p></div>
        {workspaceEventId && selectedEvent
          ? <div className={styles.eventPicker}>Tournament<strong>{selectedEvent.name}</strong></div>
          : <label className={styles.eventPicker}>Tournament<select value={eventId} onChange={(event) => selectEvent(event.target.value)}>{events.map((event) => <option key={event.id} value={event.id}>{event.is_test_event ? "TEST EVENT — " : ""}{event.name}</option>)}</select></label>}
      </header>

      {selectedEvent?.is_test_event && <div className={styles.testBanner}><strong>TEST EVENT</strong><span>TEST DATA — NOT OFFICIAL</span></div>}
      {message && <div className={styles.message}>{message}</div>}

      <nav className={styles.workflowNav} aria-label="Major scheduling sections">
        {navigation.map((item) => <button key={item.id} type="button" className={activeSection === item.id ? styles.activeNav : ""} onClick={() => selectSection(item.id)}>{item.label}</button>)}
      </nav>

      {selectedEvent && activeSection === "setup" && <EventSetup
        event={selectedEvent}
        events={events}
        days={days}
        standardTimes={standardTimes}
        onSaveOpening={saveOpening}
        onReleaseSpots={releaseSpots}
        onSaveLockHours={saveLockHours}
        onSaveDay={saveDay}
        onSaveStandardTime={saveStandardTime}
        onRemoveStandardTime={removeStandardTime}
        onCopyThursdayTimes={copyThursdayTimes}
        onApplyStandardTimes={applyStandardTimes}
        onSaveInformation={saveInformation}
      />}

      {selectedEvent && activeDayNumber && <DayWorkspace
        event={selectedEvent}
        dayNumber={activeDayNumber}
        day={activeDay}
        slots={slots}
        entries={entries}
        groups={groups}
        members={members}
        choicesBySlot={choicesBySlot}
        onAddSlot={addSlot}
        onEditSlot={editSlot}
        onSetSlotAvailability={setSlotAvailability}
        onRemoveSlot={removeSlot}
        onMovePlayer={movePlayer}
        onSaveGroup={saveGroup}
        onDeleteGroup={deleteGroup}
        onPublishDay={publishDay}
      />}

      {selectedEvent && activeSection === "weekend" && <WeekendField
        event={selectedEvent}
        entries={entries}
        weekend={weekend}
        onSetStatus={setWeekendStatus}
        onPublish={publishWeekendField}
      />}

      {selectedEvent && activeSection === "results" && <Results
        entries={entries}
        weekend={weekend}
        placements={placements}
        onSave={savePlacement}
      />}

      {selectedEvent?.is_test_event && activeSection === "testers" && <Testers
        event={selectedEvent}
        testers={testers}
        globalPlayers={globalPlayers}
        onAdd={addTester}
        onRemove={removeTester}
        onSetListing={setTestListing}
      />}
    </div>
  </main>
}

function EventSetup({ event, events, days, standardTimes, onSaveOpening, onReleaseSpots, onSaveLockHours, onSaveDay, onSaveStandardTime, onRemoveStandardTime, onCopyThursdayTimes, onApplyStandardTimes, onSaveInformation }: {
  event: MajorEvent
  events: MajorEvent[]
  days: MajorPlayDay[]
  standardTimes: MajorStandardSignupTime[]
  onSaveOpening: (form: HTMLFormElement) => Promise<void>
  onReleaseSpots: (form: HTMLFormElement) => Promise<void>
  onSaveLockHours: (form: HTMLFormElement) => Promise<void>
  onSaveDay: (dayNumber: number, form: HTMLFormElement) => Promise<void>
  onSaveStandardTime: (form: HTMLFormElement, standardTime?: MajorStandardSignupTime) => Promise<void>
  onRemoveStandardTime: (standardTime: MajorStandardSignupTime) => Promise<void>
  onCopyThursdayTimes: () => Promise<void>
  onApplyStandardTimes: () => Promise<void>
  onSaveInformation: (form: HTMLFormElement) => Promise<void>
}) {
  const informationFields = [
    { name: "signup", label: "Signup instructions", value: event.signup_instructions },
    { name: "scheduling", label: "Scheduling and changes", value: event.scheduling_instructions },
    { name: "qualifier", label: "Rounds 1 and 2", value: event.qualifier_information },
    { name: "cut", label: "Friday cut", value: event.cut_information },
    { name: "weekend", label: "Weekend fields", value: event.weekend_information },
    { name: "rooms", label: event.slug === "masters" ? "Masters rules (event-wide)" : "Event-wide rules", value: event.room_rules },
    { name: "stream", label: "Stream information", value: event.stream_information },
  ]
  return <section className={styles.workspace}>
    <div className={styles.sectionHeading}><div><p className={styles.step}>Step 1</p><h2>Event setup</h2><p>Open the field, set official dates, and explain the tournament in plain language.</p></div><span className={styles.hardCap}>Hard maximum: 100</span></div>

    <div className={styles.twoColumn}>
      <form className={styles.panel} key={`opening-${event.id}`} onSubmit={(e) => { e.preventDefault(); void onSaveOpening(e.currentTarget) }}>
        <h3>Signup opening</h3>
        <div className={styles.formGrid}>
          <label>Release 1 spots<input name="capacity" type="number" min="1" max="100" defaultValue={event.initial_release_capacity || 50} required /></label>
          <label>Public signup opens<input name="public_open" type="datetime-local" defaultValue={toDateTimeLocal(event.public_signup_opens_at)} /></label>
          <label>Guaranteed public spots at opening<input name="public_minimum" type="number" min="1" max="100" defaultValue={event.minimum_public_spots_at_open || ""} placeholder="Optional" /></label>
          <label>Event reference timezone<input name="timezone" defaultValue={event.schedule_timezone || "America/New_York"} required /></label>
          <label>Future priority opening<input name="priority_open" type="datetime-local" defaultValue={toDateTimeLocal(event.priority_signup_opens_at)} /></label>
          <label>Previous Major for priority<select name="priority_source" defaultValue={event.priority_source_event_id || ""}><option value="">None — first Major</option>{events.filter((item) => item.id !== event.id && !item.is_test_event).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </div>
        <label className={styles.check}><input name="priority_enabled" type="checkbox" defaultChecked={event.priority_signup_enabled} /> Enable previous-Major priority signup</label>
        <button className={styles.primaryButton}>Save signup opening</button>
      </form>

      <div className={styles.panel}>
        <h3>Player time changes</h3>
        <form onSubmit={(e) => { e.preventDefault(); void onSaveLockHours(e.currentTarget) }}>
          <label className={styles.sentenceField}>Player time changes lock <input name="lock_hours" type="number" min="0" defaultValue={event.schedule_lock_hours_before_first_slot ?? 24} required /> hours before the first scheduled play time of each day.</label>
          <button className={styles.primaryButton}>Save lock timing</button>
        </form>
        <div className={styles.deadlineList}>{DAY_NAMES.map((name, index) => {
          const day = days.find((item) => item.day_number === index + 1)
          return <div key={name.short}><strong>{name.short}</strong><span>{day?.selection_locks_at ? formatMastersAdminDateTime(day.selection_locks_at, event.schedule_timezone) : "Add an available time to calculate the deadline"}</span></div>
        })}</div>
      </div>
    </div>

    <form className={styles.panel} onSubmit={(e) => { e.preventDefault(); void onReleaseSpots(e.currentTarget) }}>
      <div className={styles.inlineHeading}><div><h3>Optional Release 2</h3><p>Currently released: <strong>{event.signup_capacity} / 100</strong>. This can be used once or never.</p></div>{event.later_release_used_at ? <span className={styles.complete}>Release 2 used: {event.later_release_spots}</span> : <div className={styles.releaseControl}><input name="release" aria-label="Additional spots" type="number" min="1" max={100 - (event.signup_capacity || 0)} disabled={(event.signup_capacity || 0) >= 100} required /><button className={styles.primaryButton} disabled={(event.signup_capacity || 0) >= 100}>Release spots</button></div>}</div>
    </form>

    <div className={styles.panel}><h3>Official days</h3><div className={styles.daySetupGrid}>{DAY_NAMES.map((name, index) => {
      const number = index + 1
      const day = days.find((item) => item.day_number === number)
      return <form key={`${event.id}-${number}`} onSubmit={(e) => { e.preventDefault(); void onSaveDay(number, e.currentTarget) }}><strong>{name.short}</strong><label>Day label<input name="label" defaultValue={day?.label || name.fallback} required /></label><label>Official date<input name="date" type="date" defaultValue={day?.play_date || ""} required /></label><label className={styles.check}><input name="locked" type="checkbox" defaultChecked={day?.choices_locked} /> Manual lock</label><button className={styles.secondaryButton}>Save day</button></form>
    })}</div></div>

    <section className={`${styles.panel} ${styles.standardTimesPanel}`}>
      <div className={styles.inlineHeading}><div><p className={styles.step}>Define once</p><h3>Standard signup times</h3><p>Enter normal clock times in {mastersAdminTimeZoneLabel(event.schedule_timezone)}, then explicitly apply them to all four official dates. Each day remains independently editable afterward.</p></div><button type="button" className={styles.secondaryButton} onClick={() => void onCopyThursdayTimes()}>Use Thursday times as template</button></div>
      <form className={styles.standardTimeAdd} onSubmit={(e) => { e.preventDefault(); void onSaveStandardTime(e.currentTarget) }}><label>Standard time<input name="time" type="time" required /></label><label>Optional label<input name="label" placeholder="Featured time" /></label><button className={styles.primaryButton}>Add standard time</button></form>
      {standardTimes.length ? <div className={styles.standardTimeList}>{standardTimes.map((standardTime) => <form key={standardTime.id} onSubmit={(e) => { e.preventDefault(); void onSaveStandardTime(e.currentTarget, standardTime) }}><label>Clock time<input name="time" type="time" step="60" defaultValue={standardTime.local_time.slice(0, 5)} required /></label><label>Optional label<input name="label" defaultValue={standardTime.label || ""} /></label><div className={styles.slotActions}><button className={styles.secondaryButton}>Save template time</button><button type="button" className={styles.dangerButton} onClick={() => void onRemoveStandardTime(standardTime)}>Remove from template</button></div></form>)}</div> : <div className={styles.emptyState}><strong>No standard times yet.</strong><p>Add them once, or copy the currently available Thursday times.</p></div>}
      <div className={styles.templateApply}><div><strong>Apply only when ready</strong><p>This synchronizes template-managed slots across Thursday–Sunday. Manual day overrides stay independent. Existing player choices and room-linked slots are never deleted or silently retimed.</p></div><button type="button" className={styles.publishButton} onClick={() => void onApplyStandardTimes()} disabled={days.length !== 4}>Apply standard times to all days</button></div>
      {days.length !== 4 && <p className={styles.slotWarning}>Save all four official tournament days before applying the standard template.</p>}
    </section>

    <form className={styles.panel} key={`info-${event.id}`} onSubmit={(e) => { e.preventDefault(); void onSaveInformation(e.currentTarget) }}>
      <h3>Tournament information & rules</h3>
      <label>Secondary trophy display name (optional)<input name="secondary_trophy_name" defaultValue={event.secondary_trophy_display_name || ""} placeholder="Neutral wording is used while blank" /></label>
      <div className={styles.infoGrid}>{informationFields.map(({ name, label, value }) => <label key={name}>{label}<textarea name={name} defaultValue={value || ""} /></label>)}</div>
      <button className={styles.primaryButton}>Save tournament information</button>
    </form>
  </section>
}

function DayWorkspace({ event, dayNumber, day, slots, entries, groups, members, choicesBySlot, onAddSlot, onEditSlot, onSetSlotAvailability, onRemoveSlot, onMovePlayer, onSaveGroup, onDeleteGroup, onPublishDay }: {
  event: MajorEvent
  dayNumber: number
  day?: MajorPlayDay
  slots: MajorTimeSlot[]
  entries: MajorEntry[]
  groups: MajorScheduleGroup[]
  members: MajorScheduleGroupMember[]
  choicesBySlot: Map<string, MajorDayChoice[]>
  onAddSlot: (day: MajorPlayDay, form: HTMLFormElement) => Promise<void>
  onEditSlot: (slot: MajorTimeSlot, form: HTMLFormElement) => Promise<void>
  onSetSlotAvailability: (slot: MajorTimeSlot, available: boolean, playerCount: number) => Promise<void>
  onRemoveSlot: (slot: MajorTimeSlot, playerCount: number, roomCount: number) => Promise<void>
  onMovePlayer: (entryId: string, dayId: string, slotId: string) => Promise<void>
  onSaveGroup: (slot: MajorTimeSlot, form: HTMLFormElement, group: MajorScheduleGroup | null, publish: boolean) => Promise<void>
  onDeleteGroup: (id: string) => Promise<void>
  onPublishDay: (day: MajorPlayDay) => Promise<void>
}) {
  const name = DAY_NAMES[dayNumber - 1]
  if (!day) return <section className={styles.workspace}><div className={styles.emptyState}><h2>{name.title}</h2><p>Configure this day’s official date and label in Event Setup first.</p></div></section>
  const daySlots = slots.filter((slot) => slot.play_day_id === day.id)
  const dayGroups = groups.filter((group) => group.play_day_id === day.id)
  const activeEntries = entries.filter((entry) => isActiveMajorEntryStatus(entry.status))
  const activeEntryIds = new Set(activeEntries.map((entry) => entry.id))
  const entriesWithDayChoice = new Set(daySlots.flatMap((slot) => (choicesBySlot.get(slot.id) || []).map((choice) => choice.entry_id)))
  const entriesNeedingTime = activeEntries.filter((entry) => !entriesWithDayChoice.has(entry.id))
  const published = dayGroups.length > 0 && dayGroups.every((group) => group.is_published)

  return <section className={styles.workspace}>
    <div className={styles.sectionHeading}><div><p className={styles.step}>Day {dayNumber}</p><h2>{name.title}</h2><p>{formatMastersOfficialDate(day.play_date)} · Times entered in {mastersAdminTimeZoneLabel(event.schedule_timezone)}</p></div><div className={styles.lockSummary}><strong>{isMajorDayLocked(day) ? "Player choices locked" : "Player choices open"}</strong><span>{day.selection_locks_at ? formatMastersAdminDateTime(day.selection_locks_at, event.schedule_timezone) : "Add a time to calculate the deadline"}</span></div></div>

    <div className={styles.dayActions}><form onSubmit={(e) => { e.preventDefault(); void onAddSlot(day, e.currentTarget) }}><label>Add signup time<input name="time" type="time" required /><small>Times entered in {mastersAdminTimeZoneLabel(event.schedule_timezone)}. Official date: {formatMastersOfficialDate(day.play_date)}.</small></label><label>Optional plain-language label<input name="label" placeholder="Featured time" /></label><button className={styles.primaryButton}>Add signup time</button></form><button type="button" className={styles.publishButton} onClick={() => void onPublishDay(day)}>{published ? `${name.short} rooms published` : `Publish ${name.short} rooms`}</button></div>

    <section className={styles.timeManager}><div className={styles.inlineHeading}><div><p className={styles.step}>Times</p><h3>Available signup times</h3><p>Manage any practical number of times independently for this day. Times are shown in {mastersAdminTimeZoneLabel(event.schedule_timezone)}.</p></div></div>
      {daySlots.length === 0 ? <div className={styles.emptyState}><h3>No times yet</h3><p>Add the first official play time above.</p></div> : <div className={styles.managerGrid}>{daySlots.map((slot) => {
        const playerCount = (choicesBySlot.get(slot.id) || []).filter((choice) => activeEntryIds.has(choice.entry_id)).length
        const roomCount = groups.filter((group) => group.time_slot_id === slot.id).length
        return <form key={slot.id} className={`${styles.managerCard} ${!slot.is_available ? styles.disabledSlot : ""}`} onSubmit={(e) => { e.preventDefault(); void onEditSlot(slot, e.currentTarget) }}>
          <header><div><strong>{formatMastersAdminTime(slot.starts_at, event.schedule_timezone)}</strong><span>{slot.is_available ? "Available" : "Disabled"}</span></div><b>{playerCount} selected</b></header>
          <label>{mastersAdminTimeZoneLabel(event.schedule_timezone)} time<input name="time" type="time" defaultValue={toMajorEventTimeInput(slot.starts_at, event.schedule_timezone)} required /><small>Keeps the official {name.short} date: {formatMastersOfficialDate(day.play_date)}.</small></label>
          <label>Optional label<input name="label" defaultValue={slot.label || ""} /></label>
          <div className={styles.slotActions}><button className={styles.secondaryButton}>Save time</button><button type="button" className={slot.is_available ? styles.warningButton : styles.primaryButton} onClick={() => void onSetSlotAvailability(slot, !slot.is_available, playerCount)}>{slot.is_available ? "Disable" : "Enable"}</button><button type="button" className={styles.dangerButton} onClick={() => void onRemoveSlot(slot, playerCount, roomCount)}>Remove unused</button></div>
          {!slot.is_available && playerCount > 0 && <p className={styles.slotWarning}>{playerCount} existing selection{playerCount === 1 ? " is" : "s are"} preserved. Move {playerCount === 1 ? "this player" : "these players"} with the admin override below.</p>}
        </form>
      })}</div>}
      <p className={styles.deadlineNote}><strong>{name.short} selections lock:</strong> {day.selection_locks_at ? formatMastersAdminDateTime(day.selection_locks_at, event.schedule_timezone) : "No available time exists, so no calculated deadline is set."}</p>
    </section>

    {daySlots.length > 0 && <>{entriesNeedingTime.length > 0 && <section className={styles.timeManager}><div className={styles.inlineHeading}><div><p className={styles.step}>Admin scheduling required</p><h3>Active players requiring a {name.short} time</h3><p>Choose a legitimate event time for each player. This does not place them in a room or move anyone else.</p></div></div><div className={styles.managerGrid}>{entriesNeedingTime.map((entry) => <label key={entry.id} className={styles.managerCard}><strong>{entry.player_screen_name_snapshot}</strong><select defaultValue="" onChange={(event) => { if (event.target.value) void onMovePlayer(entry.id, day.id, event.target.value) }}><option value="" disabled>Choose {name.short} time</option>{daySlots.filter((slot) => slot.is_available).map((slot) => <option key={slot.id} value={slot.id}>{formatMastersAdminTime(slot.starts_at, event.schedule_timezone)}</option>)}</select><small>Time assignment only; room placement remains deliberate.</small></label>)}</div></section>}
    <div className={styles.countSectionHeading}><p className={styles.step}>Players → rooms</p><h3>Signup counts and room builder</h3><p>Counts are guidance only. Signup times have no player capacity.</p></div><div className={styles.slotStack}>{daySlots.map((slot) => {
      const selectedChoices = choicesBySlot.get(slot.id) || []
      const selectedEntries = selectedChoices.flatMap((choice) => {
        const entry = entries.find((candidate) => candidate.id === choice.entry_id)
        return entry && isActiveMajorEntryStatus(entry.status) ? [entry] : []
      })
      const slotGroups = groups.filter((group) => group.time_slot_id === slot.id)
      const assignedIds = new Set(members.filter((member) => slotGroups.some((group) => group.id === member.group_id)).map((member) => member.entry_id))
      const unassignedEntries = selectedEntries.filter((entry) => !assignedIds.has(entry.id))
      const count = selectedEntries.length
      const guidance = count === 1 ? "Needs another player" : count === 2 ? "Workable room" : count === 3 ? "Preferred room size" : count === 4 ? "Full four-player room" : count > 4 ? "Split into rooms of up to 4" : "No players yet"
      const tone = count === 3 || count === 4 ? styles.preferred : count === 2 ? styles.workable : count === 0 ? styles.quiet : styles.attention
      return <article key={slot.id} className={`${styles.timeCard} ${!slot.is_available ? styles.disabledSlot : ""}`}>
        <header><div><p className={styles.slotTime}>{formatMastersAdminTime(slot.starts_at, event.schedule_timezone)}</p><span>{slot.label || name.fallback} · {slot.is_available ? "AVAILABLE" : "DISABLED"}</span></div><div className={`${styles.countBadge} ${tone}`}><strong>{count} {count === 1 ? "player" : "players"}</strong><span>{guidance}</span></div></header>
        <div className={styles.playerChips}>{selectedEntries.length ? selectedEntries.map((entry) => <span key={entry.id}>{entry.player_screen_name_snapshot}</span>) : <em>No one has selected this time.</em>}</div>
        <details className={styles.overridePanel}><summary>Move a player to another time</summary>{selectedEntries.map((entry) => <label key={entry.id}>{entry.player_screen_name_snapshot}<select defaultValue={slot.id} onChange={(e) => void onMovePlayer(entry.id, day.id, e.target.value)}>{daySlots.filter((option) => option.is_available || option.id === slot.id).map((option) => <option key={option.id} value={option.id}>{formatMastersAdminTime(option.starts_at, event.schedule_timezone)}{option.is_available ? "" : " — disabled"}</option>)}</select></label>)}</details>

        <div className={styles.roomBuilder}><div className={styles.roomBuilderHeading}><div><h3>Rooms</h3><p>Rooms support 1–4 players; three is preferred. Save privately until ready.</p></div><span>{unassignedEntries.length} unassigned</span></div>
          {slotGroups.map((group) => <RoomForm key={`${group.id}:${members.filter((member) => member.group_id === group.id).map((member) => member.entry_id).sort().join(",")}`} group={group} slot={slot} dayNumber={dayNumber} selectedEntries={selectedEntries} allEntries={entries} allGroups={slotGroups} namingGroups={dayGroups} isTestEvent={event.is_test_event} members={members} onSave={onSaveGroup} onDelete={onDeleteGroup} />)}
          <RoomForm key={`new:${unassignedEntries.map((entry) => entry.id).sort().join(",")}`} group={null} slot={slot} dayNumber={dayNumber} selectedEntries={unassignedEntries} allEntries={entries} allGroups={slotGroups} namingGroups={dayGroups} isTestEvent={event.is_test_event} members={members} onSave={onSaveGroup} onDelete={onDeleteGroup} />
        </div>
      </article>
    })}</div></>}
  </section>
}

function RoomForm({ group, slot, dayNumber, selectedEntries, allEntries, allGroups, namingGroups, isTestEvent, members, onSave, onDelete }: {
  group: MajorScheduleGroup | null
  slot: MajorTimeSlot
  dayNumber: number
  selectedEntries: MajorEntry[]
  allEntries: MajorEntry[]
  allGroups: MajorScheduleGroup[]
  namingGroups: MajorScheduleGroup[]
  isTestEvent: boolean
  members: MajorScheduleGroupMember[]
  onSave: (slot: MajorTimeSlot, form: HTMLFormElement, group: MajorScheduleGroup | null, publish: boolean) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const currentIds = new Set(group ? members.filter((member) => member.group_id === group.id).map((member) => member.entry_id) : [])
  const currentActiveIds = new Set([...currentIds].filter((entryId) => isActiveMajorEntryStatus(allEntries.find((entry) => entry.id === entryId)?.status || "withdrawn")))
  const preservedWithdrawnEntries = allEntries.filter((entry) => entry.status === "withdrawn" && currentIds.has(entry.id))
  const hasPreservedHistory = preservedWithdrawnEntries.length > 0
  const assignedElsewhere = new Set(members.filter((member) => allGroups.some((item) => item.id === member.group_id && item.id !== group?.id)).map((member) => member.entry_id))
  const candidates = selectedEntries.filter((entry) => currentIds.has(entry.id) || !assignedElsewhere.has(entry.id))
  const prefix = isTestEvent ? "TEST" : "KMGM"
  const usedNumbers = namingGroups.map((item) => new RegExp(`^${prefix}(\\d+)$`, "i").exec(item.group_label)?.[1]).filter(Boolean).map(Number)
  const suggestedLabel = `${prefix}${Math.max(0, ...usedNumbers) + 1}`
  const [selectedCount, setSelectedCount] = useState(currentActiveIds.size)
  return <form className={group ? styles.roomCard : styles.newRoomCard} onSubmit={(e) => e.preventDefault()}>
    <div className={styles.roomTitle}><strong>{group?.group_label || "Create another room"}</strong>{group && <span className={group.is_published ? styles.published : styles.private}>{group.is_published ? "Published" : "Private"}</span>}</div>
    <div className={styles.formGrid}>
      <label>Room label<input name="label" defaultValue={group?.group_label || suggestedLabel} required /><small>{group ? "Customize if needed." : `Next suggested ${isTestEvent ? "TEST" : "official Krys Mini Golf Majors"} room label; you may override it.`}</small></label>
      <label>Room competition display<select name="competition" defaultValue={group?.competition || (dayNumber <= 2 ? "qualifying" : "main")}><option value="qualifying">Rounds 1–2 field</option><option value="main">Main Event</option><option value="secondary">Secondary trophy field</option></select><small>Player classifications remain individual and do not limit who may share this physical room.</small></label>
      <label>Course / lobby / location<input name="location" defaultValue={group?.location || ""} /></label>
      <label>Room instructions<textarea name="instructions" defaultValue={group?.instructions || ""} rows={4} placeholder="Optional instructions shown to every player in this published room" /><small>Blank is allowed. Updating only this field on a published room preserves its roster, time, day, round, and publication state.</small></label>
      <label>Private admin notes<input name="notes" defaultValue={group?.admin_notes || ""} /></label>
    </div>
    <div className={styles.rosterPicker}><strong>{group ? "Players in this room" : "Unassigned players"}</strong>{candidates.length ? candidates.map((entry) => <label key={entry.id}><input type="checkbox" name="entry" value={entry.id} defaultChecked={currentIds.has(entry.id)} onChange={(event) => setSelectedCount(event.currentTarget.form?.querySelectorAll('input[name="entry"]:checked').length || 0)} />{entry.player_screen_name_snapshot}</label>) : <p>No unassigned players at this time.</p>}</div>
    {hasPreservedHistory && <p className={styles.slotWarning}><strong>Historical room preserved:</strong> {preservedWithdrawnEntries.map((entry) => entry.player_screen_name_snapshot).join(", ")} withdrew after this room started or score activity existed. Roster edits and deletion are disabled so legitimate history is not erased.</p>}
    {selectedCount === 1 && <p className={styles.slotWarning}><strong>Incomplete room:</strong> assign at least one more player before finalizing or publishing.</p>}
    <label className={styles.check}><input type="checkbox" name="finalized" defaultChecked={group?.is_finalized && currentActiveIds.size >= 2} disabled={selectedCount < 2 || hasPreservedHistory} /> Room composition finalized</label>
    <div className={styles.roomActions}><button type="button" className={styles.secondaryButton} disabled={hasPreservedHistory || selectedCount === 0 || selectedCount > 4} onClick={(e) => void onSave(slot, e.currentTarget.form!, group, false)}>Save privately</button><button type="button" className={styles.primaryButton} disabled={hasPreservedHistory || selectedCount < 2 || selectedCount > 4} onClick={(e) => void onSave(slot, e.currentTarget.form!, group, true)}>Save & publish</button>{group && <button type="button" className={styles.dangerButton} disabled={hasPreservedHistory} onClick={() => void onDelete(group.id)}>Delete room</button>}</div>
    {group && <p className={styles.help}>To move someone between rooms, remove and save here first; then add them to the destination room.</p>}
  </form>
}

function WeekendField({ event, entries, weekend, onSetStatus, onPublish }: {
  event: MajorEvent
  entries: MajorEntry[]
  weekend: MajorWeekendStatus[]
  onSetStatus: (entryId: string, status: MajorWeekendStatus["competition_status"]) => Promise<void>
  onPublish: () => Promise<void>
}) {
  return <section className={styles.workspace}><div className={styles.sectionHeading}><div><p className={styles.step}>Friday cut</p><h2>Weekend field</h2><p>Stage decisions privately. Both fields continue Saturday and Sunday.</p></div>{event.weekend_status_published_at ? <span className={styles.complete}>Published {formatMastersAdminDateTime(event.weekend_status_published_at, event.schedule_timezone)}</span> : <button type="button" className={styles.publishButton} onClick={() => void onPublish()}>Publish weekend field</button>}</div>
    {!event.weekend_status_published_at && <div className={styles.privacyNotice}><strong>Private staging</strong><p>Players see “Weekend field status pending.” Saturday/Sunday field and room details remain hidden until publication.</p></div>}
    <div className={styles.playerTable}>{entries.filter((entry) => isActiveMajorEntryStatus(entry.status)).map((entry) => <label key={entry.id}><span><strong>{entry.player_screen_name_snapshot}</strong><small>{entry.player_id}</small></span><select value={weekend.find((item) => item.entry_id === entry.id)?.competition_status || "pending"} onChange={(e) => void onSetStatus(entry.id, e.target.value as MajorWeekendStatus["competition_status"])}><option value="pending">Pending</option><option value="main">Main Event</option><option value="secondary">{event.secondary_trophy_display_name || "Secondary trophy field"}</option></select></label>)}</div>
  </section>
}

function Results({ entries, weekend, placements, onSave }: {
  entries: MajorEntry[]
  weekend: MajorWeekendStatus[]
  placements: MajorFinalPlacement[]
  onSave: (entryId: string, form: HTMLFormElement) => Promise<void>
}) {
  return <section className={styles.workspace}><div className={styles.sectionHeading}><div><p className={styles.step}>Permanent history</p><h2>Results</h2><p>Main and Secondary placements stay separate. Ties such as T3 are supported.</p></div></div><div className={styles.resultList}>{entries.map((entry) => {
    const result = placements.find((item) => item.entry_id === entry.id)
    const staged = weekend.find((item) => item.entry_id === entry.id)?.competition_status || "pending"
    return <article key={entry.id} className={styles.resultCard}><header><strong>{result?.player_screen_name_snapshot || entry.player_screen_name_snapshot}</strong><small>{result?.player_id || entry.player_id}</small></header>{result?.is_finalized ? <div className={styles.finalResult}><strong>{result.is_tied ? "T" : ""}{result.field_placement || "—"}</strong><span>{result.weekend_field === "main" ? "Main Event" : "Secondary field"} · {result.result_status}{result.is_winner ? " · Official winner" : ""}</span><em>Finalized — immutable history</em></div> : <form onSubmit={(e) => { e.preventDefault(); void onSave(entry.id, e.currentTarget) }}><label>Field<select name="field" defaultValue={result?.weekend_field || (staged === "main" || staged === "secondary" ? staged : "")} required><option value="">Stage weekend field first</option><option value="main">Main Event</option><option value="secondary">Secondary field</option></select></label><label>Placement<input name="placement" type="number" min="1" defaultValue={result?.field_placement || ""} /></label><label>Status<select name="result_status" defaultValue={result?.result_status || "pending"}><option value="pending">Pending</option><option value="completed">Completed</option><option value="did_not_finish">Did not finish</option><option value="withdrawn">Withdrawn</option><option value="disqualified">Disqualified</option></select></label><label className={styles.check}><input name="tied" type="checkbox" defaultChecked={result?.is_tied} /> Tied placement</label><label className={styles.check}><input name="winner" type="checkbox" defaultChecked={result?.is_winner} /> Official winner</label><label className={styles.check}><input name="finalize" type="checkbox" /> Finalize permanently</label><button className={styles.primaryButton}>Save result</button></form>}</article>
  })}</div></section>
}

function Testers({ event, testers, globalPlayers, onAdd, onRemove, onSetListing }: {
  event: MajorEvent
  testers: MajorTestTester[]
  globalPlayers: ProtectedAdminGlobalPlayer[]
  onAdd: (playerId: string) => Promise<boolean>
  onRemove: (playerId: string) => Promise<void>
  onSetListing: (listed: boolean) => Promise<void>
}) {
  const [search, setSearch] = useState("")
  const [selectedPlayerId, setSelectedPlayerId] = useState("")
  const testerIds = useMemo(() => new Set(testers.map((tester) => tester.player_id)), [testers])
  const matches = useMemo(
    () => globalPlayers.filter((player) => player.active && globalPlayerMatchesSearch(player, search)).slice(0, 20),
    [globalPlayers, search],
  )
  const selectedPlayer = globalPlayers.find((player) => player.id === selectedPlayerId)

  return <section className={styles.workspace}><div className={styles.sectionHeading}><div><p className={styles.step}>TEST EVENT</p><h2>Trusted testers</h2><p>Search the Global Players identity directory. TEST DATA — NOT OFFICIAL.</p></div><Link href={`/majors/${event.slug}`} className={styles.primaryLink}>Open tester signup</Link></div><div className={styles.panel}><label>Find a Global Player<input value={search} onChange={(event) => { setSearch(event.target.value); setSelectedPlayerId("") }} placeholder="Search current name or verified identity alias…" /></label>{search.trim() && <div className={styles.playerSearchResults}>{matches.length ? matches.map((player) => <button key={player.id} type="button" className={selectedPlayerId === player.id ? styles.selectedPlayer : ""} onClick={() => setSelectedPlayerId(player.id)} disabled={testerIds.has(player.id)}><span><strong>{player.screenName}</strong><small>{globalPlayerIdentitySummary(player)}{player.discordId ? ` · ID ${player.discordId}` : ""}</small>{player.verifiedAliases.length > 0 && <small>Verified aliases: {player.verifiedAliases.join(", ")}</small>}</span><em>{testerIds.has(player.id) ? "Already trusted" : "Select"}</em></button>) : <p className={styles.help}>No active canonical Global Player matches that search.</p>}</div>}{selectedPlayer && <div className={styles.selectedPlayerSummary}><span><strong>{selectedPlayer.screenName}</strong><small>{globalPlayerIdentitySummary(selectedPlayer)}</small><small>Canonical player: {selectedPlayer.id}</small></span><button type="button" className={styles.primaryButton} onClick={() => { void onAdd(selectedPlayer.id).then((saved) => { if (saved) { setSearch(""); setSelectedPlayerId("") } }) }} disabled={testerIds.has(selectedPlayer.id)}>Add trusted tester</button></div>}<details className={styles.uuidFallback}><summary>Advanced UUID fallback</summary><form onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const requestedId = String(new FormData(form).get("player_id") || "").trim(); const canonicalPlayer = globalPlayers.find((player) => player.id === requestedId); if (!canonicalPlayer) { setSearch(requestedId); return } void onAdd(canonicalPlayer.id).then((saved) => { if (saved) form.reset() }) }}><label>Canonical player UUID<input name="player_id" required placeholder="00000000-0000-0000-0000-000000000000" /></label><button className={styles.secondaryButton}>Add by UUID</button></form><p className={styles.help}>Fallback accepts only a current canonical UUID found in Global Players.</p></details></div><div className={styles.testerList}>{testers.length ? testers.map((tester) => <div key={tester.player_id}><span><strong>{tester.screen_name}</strong><small>{tester.player_id}</small></span><button type="button" className={styles.dangerButton} onClick={() => void onRemove(tester.player_id)}>Remove</button></div>) : <p>No trusted testers yet.</p>}</div><label className={styles.check}><input type="checkbox" checked={event.test_event_listed} onChange={(e) => void onSetListing(e.target.checked)} /> Show TEST in the signed-in trusted-tester Majors listing</label></section>
}
