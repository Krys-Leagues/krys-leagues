"use client"

import { useMemo, useState } from "react"
import styles from "./page.module.css"

export type BracketPlayer = { id: string; screen_name: string }
export type BracketRound = {
  round_number: number
  name: string | null
  deadline_at: string | null
  is_final: boolean
}
export type BracketMatch = {
  id: string
  round_number: number
  match_number: number
  stable_key: string
  status: string
  player_a_id: string | null
  player_b_id: string | null
  winner_player_id: string | null
  loser_player_id: string | null
  scheduled_at: string | null
  deadline_at: string | null
  match_timezone: string | null
  slot_a: Record<string, unknown>
  slot_b: Record<string, unknown>
}
export type BracketConfirmation = {
  match_id: string
  player_id: string
  selected_winner_id: string
  created_at: string
}
export type BracketResult = {
  match_id: string
  winner_player_id: string
  loser_player_id: string
  score_label: string
  evidence_reference: string
  verified_by: string
  recorded_at: string
}
export type ForcedAdvancement = {
  match_id: string
  advancing_player_id: string
  reason: string
  decided_by: string
  created_at: string
}
export type BracketAdminData = {
  tournament: {
    id: string
    name: string
    slug: string
    status: string
    bracketSize: number
    format: string
    startAt: string | null
    overallDeadlineAt: string | null
  }
  rounds: BracketRound[]
  matches: BracketMatch[]
  players: Record<string, string>
  confirmations: BracketConfirmation[]
  results: BracketResult[]
  forcedAdvancements: ForcedAdvancement[]
}

type ActionState = { matchId: string; action: "record_result" | "force_advance" } | null

export default function BracketAdminClient({ initialData }: { initialData: BracketAdminData }) {
  const data = initialData
  const [selected, setSelected] = useState<ActionState>(null)
  const [winnerId, setWinnerId] = useState("")
  const [scoreLabel, setScoreLabel] = useState("")
  const [evidenceReference, setEvidenceReference] = useState("")
  const [reason, setReason] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const counts = useMemo(
    () => ({
      completed: data.matches.filter((match) => match.status === "completed").length,
      pending: data.matches.filter((match) => match.status !== "completed").length,
      confirmations: data.confirmations.length,
    }),
    [data]
  )

  const rounds = useMemo(() => {
    const byRound = new Map<number, BracketMatch[]>()
    for (const match of data.matches) byRound.set(match.round_number, [...(byRound.get(match.round_number) ?? []), match])
    return [...byRound.entries()].sort(([a], [b]) => a - b)
  }, [data.matches])

  function playerName(id: string | null) {
    return (id && data.players[id]) || "Waiting for advancement"
  }

  function openAction(match: BracketMatch, action: "record_result" | "force_advance") {
    setSelected({ matchId: match.id, action })
    setWinnerId(match.player_a_id ?? match.player_b_id ?? "")
    setScoreLabel("")
    setEvidenceReference("")
    setReason("")
    setMessage(null)
  }

  async function submitAction() {
    if (!selected) return
    if (!winnerId) return setMessage("Select the verified advancing player first.")
    if (selected.action === "record_result" && (!scoreLabel.trim() || !evidenceReference.trim())) {
      return setMessage("A score label and evidence reference are required for a verified result.")
    }
    if (selected.action === "force_advance" && !reason.trim()) {
      return setMessage("A written reason is required for a forced advancement.")
    }

    setBusy(true)
    setMessage(null)
    const body = selected.action === "record_result"
      ? {
          action: selected.action,
          matchId: selected.matchId,
          winnerPlayerId: winnerId,
          scoreLabel: scoreLabel.trim(),
          evidenceReference: evidenceReference.trim(),
          idempotencyKey: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${selected.matchId}-${Date.now()}`,
        }
      : {
          action: selected.action,
          tournamentId: data.tournament.id,
          matchId: selected.matchId,
          advancingPlayerId: winnerId,
          reason: reason.trim(),
        }

    try {
      const response = await fetch("/api/admin/tournaments/result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const payload = (await response.json()) as { error?: string; result?: { status?: string } }
      if (!response.ok) throw new Error(payload.error || "The tournament action failed.")
      setMessage(`Action saved: ${payload.result?.status || "completed"}. Refreshing the protected bracket…`)
      window.location.reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The tournament action failed.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Area 15 · Protected tournament operations</p>
          <h1>{data.tournament.name}</h1>
          <p className={styles.subtitle}>
            Read the existing 5-4-3-2-1 bracket, review confirmed results, and use the audited
            admin RPCs for verified advancement.
          </p>
        </div>
        <span className={styles.status}>{data.tournament.status.replaceAll("_", " ")}</span>
      </header>

      <section className={styles.safetyNotice}>
        <strong>Protected workflow</strong>
        <span>
          No bracket reset, recreation, direct table update, or player identity change is available here.
          Every write is authenticated again by the server-side site-admin guard.
        </span>
      </section>

      <section className={styles.summary} aria-label="Bracket summary">
        <div><span>Format</span><strong>{data.tournament.bracketSize}-player {data.tournament.format.replaceAll("_", " ")}</strong></div>
        <div><span>Matches</span><strong>{data.matches.length}</strong></div>
        <div><span>Completed</span><strong>{counts.completed}</strong></div>
        <div><span>Pending / active</span><strong>{counts.pending}</strong></div>
        <div><span>Confirmations</span><strong>{counts.confirmations}</strong></div>
      </section>

      {message ? <p className={styles.message} role="status">{message}</p> : null}

      <section className={styles.bracket} aria-label="Current bracket">
        {rounds.map(([roundNumber, matches]) => {
          const round = data.rounds.find((item) => item.round_number === roundNumber)
          return (
            <article className={styles.round} key={roundNumber}>
              <div className={styles.roundHeader}>
                <div><span className={styles.kicker}>Round {roundNumber}</span><h2>{round?.name || (round?.is_final ? "Final" : `Round ${roundNumber}`)}</h2></div>
                {round?.deadline_at ? <small>Deadline {new Date(round.deadline_at).toLocaleString()}</small> : null}
              </div>
              {matches.map((match) => {
                const confirmations = data.confirmations.filter((item) => item.match_id === match.id)
                const result = data.results.find((item) => item.match_id === match.id)
                const forced = data.forcedAdvancements.find((item) => item.match_id === match.id)
                const isOpen = match.status !== "completed" && match.player_a_id && match.player_b_id
                return (
                  <div className={styles.match} key={match.id}>
                    <div className={styles.matchHeader}><strong>{match.stable_key}</strong><span>{match.status.replaceAll("_", " ")}</span></div>
                    <div className={styles.players}><span>{playerName(match.player_a_id)}</span><b>vs</b><span>{playerName(match.player_b_id)}</span></div>
                    {match.status === "completed" ? <p className={styles.result}>Winner: <strong>{playerName(match.winner_player_id)}</strong>{result ? ` · ${result.score_label}` : forced ? " · forced advancement" : ""}</p> : null}
                    {confirmations.length ? <p className={styles.confirmations}>{confirmations.length} confirmation{confirmations.length === 1 ? "" : "s"}: {confirmations.map((item) => `${playerName(item.player_id)} → ${playerName(item.selected_winner_id)}`).join(" · ")}</p> : null}
                    {forced ? <p className={styles.confirmations}>Forced advance: {playerName(forced.advancing_player_id)} · {forced.reason}</p> : null}
                    {isOpen ? <div className={styles.actions}><button type="button" onClick={() => openAction(match, "record_result")}>Record verified result</button><button type="button" className={styles.secondaryButton} onClick={() => openAction(match, "force_advance")}>Force advance with reason</button></div> : null}
                    {selected?.matchId === match.id ? <div className={styles.form}><label>Advancing player<select value={winnerId} onChange={(event) => setWinnerId(event.target.value)}><option value="">Select player</option>{[match.player_a_id, match.player_b_id].filter((id): id is string => Boolean(id)).map((id) => <option key={id} value={id}>{playerName(id)}</option>)}</select></label>{selected.action === "record_result" ? <><label>Score label<input value={scoreLabel} onChange={(event) => setScoreLabel(event.target.value)} placeholder="Example: 3–2" /></label><label>Evidence reference<input value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="Discord thread, scorecard, or approved record" /></label></> : <label>Reason<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required written reason" /></label>}<div className={styles.actions}><button type="button" onClick={submitAction} disabled={busy}>{busy ? "Saving…" : "Confirm audited action"}</button><button type="button" className={styles.secondaryButton} onClick={() => setSelected(null)} disabled={busy}>Cancel</button></div></div> : null}
                  </div>
                )
              })}
            </article>
          )
        })}
      </section>
    </main>
  )
}
