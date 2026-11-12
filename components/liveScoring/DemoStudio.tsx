"use client"

import { useEffect, useMemo, useState } from "react"
import type { CSSProperties } from "react"
import Image from "next/image"
import { MGA_DEMO_PLAYERS, MGA_STUDIO_CONFIG } from "@/lib/liveScoring/config"
import { activeRoomNotices, calculateLeaderboard, canPlayerSubmitRound, dateTimeInputInZone, dateTimeInputToUtc, formatRoundDate, formatToPar, publishedRoomAssignments, removeRoomPlayer, roomNoticeKey, setRoomPublished, tournamentStorageKey, transferRoomPlayer, updateRoomRecord } from "@/lib/liveScoring/engine"
import type { RoomAssignment, RoomRecord, RoundScore } from "@/lib/liveScoring/types"
import RoomNotificationPopup from "@/components/liveScoring/RoomNotificationPopup"
import styles from "./DemoStudio.module.css"

type AuditEntry = { id: string; actor: string; player: string; round: string; action: string; from: string; to: string; at: string }
type SavedState = { scores: RoundScore[]; rooms: RoomRecord[]; dismissed: string[]; audit: AuditEntry[]; evidence: Record<string, string> }

function timeLabel(value: string, timeZone: string) {
  try { return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short" }).format(new Date(value)) }
  catch { return "Time zone unavailable" }
}

const initialState: SavedState = {
  scores: [
    { playerId: "demo-aria", roundId: "r1", strokes: 50, status: "verified", updatedAt: "2026-11-12T10:00:00Z" },
    { playerId: "demo-aria", roundId: "r2", strokes: 52, status: "submitted", updatedAt: "2026-11-13T13:00:00Z" },
    { playerId: "demo-blake", roundId: "r1", strokes: 52, status: "verified", updatedAt: "2026-11-12T11:00:00Z" },
    { playerId: "demo-blake", roundId: "r2", strokes: 50, status: "submitted", updatedAt: "2026-11-13T13:30:00Z" },
    { playerId: "demo-casey", roundId: "r1", strokes: 54, status: "verified", updatedAt: "2026-11-12T11:30:00Z" },
  ],
  rooms: MGA_STUDIO_CONFIG.rounds.flatMap((round, index) => {
    const startsAt = `2026-11-${String(12 + index).padStart(2, "0")}T12:30:00Z`
    return [
      { id: `${round.id}-room-11`, eventId: MGA_STUDIO_CONFIG.id, roundId: round.id, roomName: "KMGA11", course: round.course, difficulty: round.difficulty, startsAt, timeZone: "America/New_York", playerIds: ["demo-aria", "demo-blake"], capacity: MGA_STUDIO_CONFIG.defaultRoomCapacity, publishedVersion: 1, published: round.id === "r1" },
      { id: `${round.id}-room-12`, eventId: MGA_STUDIO_CONFIG.id, roundId: round.id, roomName: "KMGA12", course: round.course, difficulty: round.difficulty, startsAt, timeZone: "America/New_York", playerIds: ["demo-casey", "demo-drew"], capacity: MGA_STUDIO_CONFIG.defaultRoomCapacity, publishedVersion: 1, published: false },
    ]
  }),
  dismissed: [],
  audit: [],
  evidence: {},
}

export default function DemoStudio({ adminOnly = false }: { adminOnly?: boolean }) {
  const [state, setState] = useState<SavedState>(initialState)
  const [playerId, setPlayerId] = useState(MGA_DEMO_PLAYERS[0].id)
  const [roundId, setRoundId] = useState("r1")
  const [selectedRoomName, setSelectedRoomName] = useState("KMGA11")
  const [tab, setTab] = useState<"leaderboard" | "submission" | "admin">(adminOnly ? "admin" : "leaderboard")
  const [strokeInput, setStrokeInput] = useState("")
  const [holeInputs, setHoleInputs] = useState<string[]>(Array(18).fill(""))
  const [fileName, setFileName] = useState("")
  const [roomNameDraft, setRoomNameDraft] = useState("KMGA11")
  const [courseDraft, setCourseDraft] = useState("Gardens of Babylon")
  const [difficultyDraft, setDifficultyDraft] = useState<"easy" | "hard">("easy")
  const [startTimeDraft, setStartTimeDraft] = useState("")
  const [capacityDraft, setCapacityDraft] = useState(MGA_STUDIO_CONFIG.defaultRoomCapacity)
  const [loaded, setLoaded] = useState(false)
  const [message, setMessage] = useState("")
  const [large, setLarge] = useState(false)
  const config = MGA_STUDIO_CONFIG
  const round = config.rounds.find((item) => item.id === roundId) || config.rounds[0]

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(tournamentStorageKey(config.id))
        if (raw) setState({ ...initialState, ...JSON.parse(raw) as Partial<SavedState> })
      } catch { /* The synthetic preview remains usable without browser storage. */ }
      setLoaded(true)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [config.id])

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== tournamentStorageKey(config.id) || !event.newValue) return
      try { setState({ ...initialState, ...JSON.parse(event.newValue) as Partial<SavedState> }) }
      catch { /* Ignore malformed local preview state. */ }
    }
    window.addEventListener("storage", sync)
    return () => window.removeEventListener("storage", sync)
  }, [config.id])

  useEffect(() => {
    if (!loaded) return
    try { window.localStorage.setItem(tournamentStorageKey(config.id), JSON.stringify(state)) }
    catch { /* Browser storage is optional for this local-only demonstration. */ }
  }, [config.id, loaded, state])

  const leaderboard = useMemo(() => calculateLeaderboard(config, MGA_DEMO_PLAYERS, state.scores), [config, state.scores])
  const currentPlayer = MGA_DEMO_PLAYERS.find((player) => player.id === playerId)!
  const currentCard = state.scores.find((score) => score.playerId === playerId && score.roundId === roundId)
  const publishedRooms = publishedRoomAssignments(state.rooms.filter((room) => room.eventId === config.id), MGA_DEMO_PLAYERS)
  const activeNotices = activeRoomNotices(publishedRooms.filter((room) => room.playerId === playerId), state.dismissed)
  const activeNotice = adminOnly ? null : activeNotices[0]
  const roomsForRound = state.rooms.filter((room) => room.roundId === roundId)
  const roomNames = [...new Set(roomsForRound.map((room) => room.roomName))]
  const selectedRoom = roomsForRound.find((room) => room.roomName === selectedRoomName)
  const roomPublished = Boolean(selectedRoom?.published)
  const playerSchedule = publishedRooms.filter((room) => room.playerId === playerId)
  const selectedRoomId = selectedRoom?.id
  const selectedRoomNameValue = selectedRoom?.roomName
  const selectedRoomCourse = selectedRoom?.course
  const selectedRoomDifficulty = selectedRoom?.difficulty
  const selectedRoomStart = selectedRoom?.startsAt
  const selectedRoomCapacity = selectedRoom?.capacity

  useEffect(() => {
    if (!selectedRoomId || !selectedRoomNameValue || !selectedRoomCourse || !selectedRoomStart || selectedRoomCapacity === undefined) return
    const timer = window.setTimeout(() => {
      setRoomNameDraft(selectedRoomNameValue)
      setCourseDraft(selectedRoomCourse)
      setDifficultyDraft(selectedRoomDifficulty || "easy")
      setStartTimeDraft(dateTimeInputInZone(selectedRoomStart, "America/New_York"))
      setCapacityDraft(selectedRoomCapacity)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [selectedRoomId, selectedRoomNameValue, selectedRoomCourse, selectedRoomDifficulty, selectedRoomStart, selectedRoomCapacity])

  function update(next: SavedState) { setState(next); setMessage("Saved in this Preview browser only.") }

  function handleImage(file?: File) {
    if (!file) return
    if (!file.type.startsWith("image/")) { setMessage("Choose a scorecard image file."); return }
    if (file.size > 2 * 1024 * 1024) { setMessage("Demo evidence images must be 2 MB or smaller."); return }
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => setState((current) => ({ ...current, evidence: { ...current.evidence, [`${playerId}:${roundId}`]: String(reader.result || "") } }))
    reader.readAsDataURL(file)
  }

  function submitScore() {
    const strokes = Number(strokeInput)
    const image = state.evidence[`${playerId}:${roundId}`]
    if (!Number.isInteger(strokes) || strokes < 18 || strokes > 180) { setMessage("Enter a whole-round total from 18 to 180 strokes."); return }
    if (!image) { setMessage("Attach a scorecard image before submitting."); return }
    if (!canPlayerSubmitRound(currentCard?.status)) { setMessage("This round already has a submission. Ask an Admin to reopen it for correction."); return }
    update({ ...state, scores: [...state.scores.filter((item) => !(item.playerId === playerId && item.roundId === roundId)), { playerId, roundId, strokes, status: "submitted", updatedAt: new Date().toISOString() }] })
  }

  function saveAdminScore() {
    if (holeInputs.some((value) => !Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 10)) { setMessage("Enter a stroke count from 1 to 10 for all 18 holes."); return }
    const strokes = holeInputs.reduce((total, value) => total + Number(value), 0)
    const old = state.scores.find((item) => item.playerId === playerId && item.roundId === roundId)
    const nextScore: RoundScore = { playerId, roundId, strokes, status: "submitted", updatedAt: new Date().toISOString() }
    update({ ...state, scores: [...state.scores.filter((item) => !(item.playerId === playerId && item.roundId === roundId)), nextScore], audit: [{ id: crypto.randomUUID(), actor: "Preview Admin", player: currentPlayer.screenName, round: round.label, action: old ? "Corrected score" : "Entered score", from: old ? `${old.strokes}` : "—", to: `${strokes}`, at: new Date().toISOString() }, ...state.audit] })
  }

  function approve(player: string, selectedRound: string) {
    const prior = state.scores.find((score) => score.playerId === player && score.roundId === selectedRound)
    if (!prior) return
    const playerName = MGA_DEMO_PLAYERS.find((item) => item.id === player)?.screenName || "Player"
    update({ ...state, scores: state.scores.map((score) => score.playerId === player && score.roundId === selectedRound ? { ...score, status: "verified", updatedAt: new Date().toISOString() } : score), audit: [{ id: crypto.randomUUID(), actor: "Preview Admin", player: playerName, round: config.rounds.find((item) => item.id === selectedRound)?.label || "Round", action: "Verified score", from: `${prior.strokes}`, to: `${prior.strokes}`, at: new Date().toISOString() }, ...state.audit] })
  }

  function publishRoom(publish: boolean) {
    if (!selectedRoom) return
    const action = publish ? "Published room" : "Unpublished room"
    update({ ...state, rooms: setRoomPublished(state.rooms, selectedRoom.id, publish), audit: [{ id: crypto.randomUUID(), actor: "Preview Admin", player: selectedRoom.roomName, round: round.label, action, from: `${selectedRoom.published}`, to: `${publish}`, at: new Date().toISOString() }, ...state.audit] })
  }

  function saveRoomEdits() {
    const nextName = roomNameDraft.trim()
    const startsAt = dateTimeInputToUtc(startTimeDraft, "America/New_York")
    if (!nextName || !startsAt || !courseDraft.trim()) { setMessage("Enter a room name, course, and Eastern start time."); return }
    if (!selectedRoom) return
    const changed = selectedRoom.roomName !== nextName || selectedRoom.course !== courseDraft.trim() || selectedRoom.difficulty !== difficultyDraft || selectedRoom.startsAt !== startsAt || selectedRoom.capacity !== capacityDraft
    if (!Number.isInteger(capacityDraft) || capacityDraft < selectedRoom.playerIds.length) { setMessage(`Capacity must be at least ${selectedRoom.playerIds.length}, the number currently assigned.`); return }
    const nextRooms = updateRoomRecord(state.rooms, selectedRoom.id, { roomName: nextName, course: courseDraft.trim(), difficulty: difficultyDraft, startsAt, capacity: capacityDraft })
    setState((current) => ({ ...current, rooms: nextRooms, audit: changed ? [{ id: crypto.randomUUID(), actor: "Preview Admin", player: nextName, round: round.label, action: "Edited room", from: `${selectedRoom.roomName} · ${selectedRoom.course} · ${selectedRoom.difficulty} · ${selectedRoom.startsAt} · capacity ${selectedRoom.capacity}`, to: `${nextName} · ${courseDraft.trim()} · ${difficultyDraft} · ${startsAt} · capacity ${capacityDraft}`, at: new Date().toISOString() }, ...current.audit] : current.audit }))
    setSelectedRoomName(nextName)
    setMessage(changed && roomPublished ? "Room updated. Assigned players receive a fresh notice." : "Room details saved in this Preview browser only.")
  }

  function createRoom() {
    const name = roomNameDraft.trim()
    const startsAt = dateTimeInputToUtc(startTimeDraft, "America/New_York")
    if (!name || !startsAt || !courseDraft.trim()) { setMessage("Set an exact name, course, and Eastern start time before creating the room."); return }
    if (state.rooms.some((room) => room.eventId === config.id && room.roundId === roundId && room.roomName === name)) { setMessage("That room name already exists in this round."); return }
    const room: RoomRecord = { id: crypto.randomUUID(), eventId: config.id, roundId, roomName: name, course: courseDraft.trim(), difficulty: difficultyDraft, startsAt, timeZone: "America/New_York", playerIds: [], capacity: capacityDraft, publishedVersion: 1, published: false }
    setState((current) => ({ ...current, rooms: [...current.rooms, room], audit: [{ id: crypto.randomUUID(), actor: "Preview Admin", player: name, round: round.label, action: "Created room", from: "—", to: `${name} · capacity ${room.capacity}`, at: new Date().toISOString() }, ...current.audit] }))
    setSelectedRoomName(name)
    setMessage("Room created as a draft. Add Global Players, then publish it when ready.")
  }

  function moveSelectedPlayer() {
    if (!selectedRoom) return
    const oldMembership = roomsForRound.find((room) => room.playerIds.includes(playerId))
    const result = transferRoomPlayer(state.rooms, config.id, roundId, playerId, selectedRoom.id)
    if (result.error) { setMessage(result.error); return }
    update({ ...state, rooms: result.rooms, audit: [{ id: crypto.randomUUID(), actor: "Preview Admin", player: currentPlayer.screenName, round: round.label, action: oldMembership ? "Transferred Global Player" : "Added Global Player", from: oldMembership?.roomName || "Unassigned", to: selectedRoom.roomName, at: new Date().toISOString() }, ...state.audit] })
  }

  function removeSelectedPlayer() {
    const assignedRoom = roomsForRound.find((room) => room.playerIds.includes(playerId))
    if (!assignedRoom) { setMessage(`${currentPlayer.screenName} is not assigned in this round.`); return }
    const result = removeRoomPlayer(state.rooms, config.id, roundId, playerId)
    if (result.error) { setMessage(result.error); return }
    update({ ...state, rooms: result.rooms, audit: [{ id: crypto.randomUUID(), actor: "Preview Admin", player: currentPlayer.screenName, round: round.label, action: "Removed Global Player", from: assignedRoom.roomName, to: "Unassigned", at: new Date().toISOString() }, ...state.audit] })
  }

  function dismissRoom(room: RoomAssignment) {
    const next = [...new Set([...state.dismissed, roomNoticeKey(room)])]
    setState((current) => ({ ...current, dismissed: next }))
  }

  return <main className={`${styles.page} ${large ? styles.large : ""}`} style={{ "--accent": config.theme.accent, "--surface": config.theme.surface, "--ink": config.theme.text, "--muted": config.theme.muted, "--artwork": `url(${config.artwork})` } as CSSProperties}>
    <div className={styles.shell}>
      <header className={styles.hero}>
        <div><p className={styles.eyebrow}>Krys&apos; Leagues · Scoring Studio · Interactive Preview</p><h1>{config.name}</h1><p>{config.subtitle}</p><p className={styles.disclaimer}>All players, scores, room assignments, and demo par values are synthetic. Edits persist only in this browser and never write to Production.</p></div>
        <button className={styles.toggle} onClick={() => setLarge((value) => !value)}>{large ? "Compact display" : "Large display"}</button>
      </header>
      <section className={styles.toolbar}>
        <div className={styles.rounds}>{config.rounds.map((item) => <button className={roundId === item.id ? styles.selected : ""} key={item.id} onClick={() => { setRoundId(item.id); setSelectedRoomName(state.rooms.find((room) => room.roundId === item.id)?.roomName || "KMGA11"); setStrokeInput(""); setFileName(""); setHoleInputs(Array(18).fill("")) }}><strong>R{item.number}</strong><span>{formatRoundDate(item)}</span></button>)}</div>
        {!adminOnly && <label className={styles.playerPicker}>Preview as<select value={playerId} onChange={(event) => setPlayerId(event.target.value)}>{MGA_DEMO_PLAYERS.map((player) => <option key={player.id} value={player.id}>{player.screenName}</option>)}</select></label>}
        {adminOnly && <label className={styles.playerPicker}>Select player<select value={playerId} onChange={(event) => setPlayerId(event.target.value)}>{MGA_DEMO_PLAYERS.map((player) => <option key={player.id} value={player.id}>{player.screenName}</option>)}</select></label>}
      </section>

      {!adminOnly && <nav className={styles.tabs}><button className={tab === "leaderboard" ? styles.tabSelected : ""} onClick={() => setTab("leaderboard")}>Leaderboard</button><button className={tab === "submission" ? styles.tabSelected : ""} onClick={() => setTab("submission")}>My Tournament / Submit</button></nav>}
      {adminOnly && <div className={styles.adminBadge}>Authorized site-admin route · sample data only</div>}

      {(tab === "leaderboard" || adminOnly) && !adminOnly && <section className={styles.panel}>
        <div className={styles.panelHeading}><div><p className={styles.eyebrow}>One championship · Four rounds</p><h2>Combined leaderboard</h2></div><span>Par {config.rounds.reduce((sum, item) => sum + item.par, 0)} per round</span></div>
        <div className={styles.tableWrap}><table><thead><tr><th>POS</th><th>PLAYER</th>{config.rounds.map((item) => <th key={item.id}>R{item.number}</th>)}<th>COMBINED TOTAL</th><th>ROUNDS</th><th>RESULT</th></tr></thead><tbody>{leaderboard.map((row) => <tr key={row.player.id}><td>{row.rank ?? "—"}</td><th scope="row">{row.player.screenName}</th>{row.rounds.map(({ round: rowRound, toPar, score }) => <td key={rowRound.id}><strong>{formatToPar(toPar)}</strong>{score && <small className={score.status === "verified" ? styles.official : styles.provisional}>{score.status === "verified" ? "Verified" : "Provisional"}</small>}</td>)}<td className={styles.total}>{formatToPar(row.combined)}</td><td>{row.playedRounds}/{config.rounds.length} played</td><td><span className={row.status === "Official" ? styles.official : styles.provisional}>{row.status}</span></td></tr>)}</tbody></table></div>
        <p className={styles.note}>Totals sum only rounds with recorded scores. Missing rounds stay Not Played. Ties share the same rank; scores shown here are synthetic preview data.</p>
      </section>}

      {(!adminOnly && tab === "submission") && <section id="submission" className={styles.panel}>
        <p className={styles.eyebrow}>My Tournament / My Schedule</p><h2>Published room assignments</h2>
        <div className={styles.schedule}>{playerSchedule.map((room) => <article key={`${room.roundId}:${room.roomId}`}><strong>{room.roomName} · {config.rounds.find((item) => item.id === room.roundId)?.label}</strong><span>{room.course} · {room.difficulty.toUpperCase()}</span><span>Eastern: {timeLabel(room.startsAt, "America/New_York")}</span><span>Local: {timeLabel(room.startsAt, room.timeZone)}</span><span>Room: {room.roomRoster.join(", ")}</span></article>)}</div>
        {playerSchedule.length === 0 && <p>No room is published for this player yet.</p>}
        <p className={styles.eyebrow}>Player scorecard</p><h2>{currentPlayer.screenName} · {round.label}</h2><p>{round.course} · {round.difficulty.toUpperCase()} · {formatRoundDate(round)}</p>
        <div className={styles.scoreForm}><label>Your 18-hole total strokes<input inputMode="numeric" type="number" min="18" max="180" value={strokeInput || currentCard?.strokes || ""} onChange={(event) => setStrokeInput(event.target.value)} disabled={currentCard?.status === "verified"} /></label>
          <label className={styles.drop} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); handleImage(event.dataTransfer.files?.[0]) }}><span>Drop scorecard image here or choose a file</span><input type="file" accept="image/*" onChange={(event) => handleImage(event.target.files?.[0])} /><small>{fileName || state.evidence[`${playerId}:${roundId}`] ? fileName || "Scorecard image attached" : "Image evidence required · up to 2 MB in this demo"}</small></label>
          <button className={styles.primary} disabled={!canPlayerSubmitRound(currentCard?.status)} onClick={submitScore}>{currentCard?.status === "submitted" ? "Awaiting Admin review" : currentCard?.status === "verified" ? "Verified scorecard" : "Submit for Admin review"}</button>
        </div>
        {state.evidence[`${playerId}:${roundId}`] && <Image className={styles.evidence} src={state.evidence[`${playerId}:${roundId}`]} alt="Attached synthetic scorecard evidence" width={260} height={220} unoptimized />}
        <p className={styles.note}>Submission status: <strong>{currentCard ? currentCard.status === "verified" ? "Approved · official" : "Submitted · pending review" : "Not submitted"}</strong>. Duplicate submissions are disabled until an Admin reopens the round.</p>
      </section>}

      {(tab === "admin" || adminOnly) && <section className={styles.panel}>
        <p className={styles.eyebrow}>Admin scoring · isolated preview</p><h2>Enter and correct a round</h2><p>{currentPlayer.screenName} · {round.label} · all 18 holes</p>
        <div className={styles.holes}>{holeInputs.map((value, index) => <label key={index}>H{index + 1}<input type="number" min="1" max="10" value={value} onChange={(event) => setHoleInputs((current) => current.map((hole, position) => position === index ? event.target.value : hole))} /></label>)}</div>
        <button className={styles.primary} onClick={saveAdminScore}>Save / correct selected score</button>
        <h3>Submission review</h3><div className={styles.reviewList}>{state.scores.filter((score) => score.status === "submitted").map((score) => <article key={`${score.playerId}:${score.roundId}`}><span>{MGA_DEMO_PLAYERS.find((item) => item.id === score.playerId)?.screenName} · R{config.rounds.find((item) => item.id === score.roundId)?.number} · {score.strokes} strokes</span><button onClick={() => approve(score.playerId, score.roundId)}>Approve</button></article>)}</div>
        <h3>Universal Room Builder · popup reads this room record</h3><div className={styles.roomAdmin}><label>Select room<select value={roomNames.includes(selectedRoomName) ? selectedRoomName : roomNames[0] || ""} onChange={(event) => setSelectedRoomName(event.target.value)}>{roomNames.map((name) => <option key={name}>{name}</option>)}</select></label><label>Exact room name<input value={roomNameDraft} onChange={(event) => setRoomNameDraft(event.target.value)} /></label><label>Course<input value={courseDraft} onChange={(event) => setCourseDraft(event.target.value)} /></label><label>Difficulty<select value={difficultyDraft} onChange={(event) => setDifficultyDraft(event.target.value as "easy" | "hard")}><option value="easy">Easy</option><option value="hard">Hard</option></select></label><label>Start time · Eastern<input type="datetime-local" value={startTimeDraft} onChange={(event) => setStartTimeDraft(event.target.value)} /></label><label>Capacity (4 is the default)<input type="number" min="1" value={capacityDraft} onChange={(event) => setCapacityDraft(Number(event.target.value))} /></label><p>Global Players assigned: {selectedRoom?.playerIds.map((id) => MGA_DEMO_PLAYERS.find((item) => item.id === id)?.screenName).filter(Boolean).join(", ") || "None"}. Only this room&apos;s published members receive the popup.</p><div className={styles.roomActions}><button onClick={createRoom}>Create Room draft</button><button onClick={moveSelectedPlayer}>Add / transfer selected Global Player</button><button onClick={removeSelectedPlayer}>Remove selected Global Player</button><button onClick={saveRoomEdits}>Save room changes</button><button className={styles.primary} onClick={() => publishRoom(!roomPublished)}>{roomPublished ? "Unpublish selected room" : "Publish selected room"}</button></div></div>
        <h3>Audit trail</h3><ul className={styles.audit}>{state.audit.length ? state.audit.map((entry) => <li key={entry.id}>{new Date(entry.at).toLocaleString()} · {entry.actor} · {entry.action}: {entry.player}, {entry.round}, {entry.from} → {entry.to}</li>) : <li>Score changes and room changes will appear here.</li>}</ul>
      </section>}
      {message && <p className={styles.toast} role="status">{message}</p>}
    </div>

    {activeNotice && <RoomNotificationPopup config={config} room={activeNotice} onDismiss={() => dismissRoom(activeNotice)} onOpenScorecard={() => setTab("submission")} />}
  </main>
}
