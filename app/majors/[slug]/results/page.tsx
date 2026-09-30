"use client"

import Image from "next/image"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  buildMastersLiveRows,
  formatMastersLiveScore,
  sortMastersLiveRows,
  type MastersBoardView,
  type MastersLiveRow,
  type MastersRoundNumber,
} from "@/lib/mastersLiveResults"
import {
  majorHoleOutcome,
  majorRoundDayLabel,
  type MajorPlayerScorecard,
  type MajorResultsPayload,
} from "@/lib/majors"
import { supabase } from "@/lib/supabase"

import styles from "./page.module.css"

const BOARD_OPTIONS: Array<{ id: MastersBoardView; label: string; shortLabel: string }> = [
  { id: "easy", label: "Rounds 1 & 2", shortLabel: "R1 & R2" },
  { id: "hard", label: "Rounds 3 & 4", shortLabel: "R3 & R4" },
  { id: "overall", label: "Overall Masters", shortLabel: "Overall" },
]

export default function MajorResultsPage() {
  const { slug } = useParams<{ slug: string }>()
  const [data, setData] = useState<MajorResultsPayload | null>(null)
  const [view, setView] = useState<MastersBoardView>("overall")
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [message, setMessage] = useState("")

  const load = useCallback(async () => {
    const eventResult = await supabase.from("major_events").select("id").eq("slug", slug).maybeSingle()
    if (!eventResult.data) {
      setMessage(eventResult.error?.message || "Major not found.")
      return
    }

    const result = await supabase.rpc("get_public_major_live_results", {
      p_major_event_id: eventResult.data.id,
    })
    setData(result.data as MajorResultsPayload | null)
    setMessage(result.error?.message || "")
  }, [slug])

  useEffect(() => {
    // Initial public result synchronization plus lightweight live polling.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    const timer = window.setInterval(() => void load(), 15_000)
    return () => window.clearInterval(timer)
  }, [load])

  const rows = useMemo(() => (data ? buildMastersLiveRows(data) : []), [data])
  const orderedRows = useMemo(() => sortMastersLiveRows(rows, view), [rows, view])
  const selectedRow = rows.find((row) => row.playerId === selectedPlayerId) ?? null
  const selectedCards = useMemo(
    () => data?.rounds.flatMap((round) => round.cards).filter((card) => card.player_id === selectedPlayerId) ?? [],
    [data, selectedPlayerId]
  )

  if (!data) {
    return <main className={styles.loading}>{message || "Loading live Masters results…"}</main>
  }

  return (
    <main className={styles.page}>
      <div className={styles.blossomGlow} aria-hidden="true" />
      <div className={styles.shell}>
        <Link className={styles.backLink} href={`/majors/${slug}`}>
          ← Back to {data.event.name}
        </Link>

        {data.event.is_test_event ? (
          <p className={styles.testBanner}>TEST EVENT · TEST DATA — NOT OFFICIAL</p>
        ) : null}

        <header className={styles.masthead}>
          <div className={styles.logoFrame}>
            <Image
              className={styles.logo}
              src="/masters/krys-leagues-logo-source.png"
              alt="Krys Leagues"
              width={808}
              height={794}
              priority
            />
          </div>
          <div className={styles.titleBlock}>
            <p className={styles.eyebrow}>KRYS LEAGUES · MAJORS SERIES</p>
            <h1>THE MINI-GOLF MASTERS</h1>
            <p>Cherry Blossom · Live Tournament Scoreboards</p>
          </div>
          <div className={styles.liveMark}>
            <span aria-hidden="true" />
            LIVE
          </div>
        </header>

        <section className={styles.statusStrip} aria-label="Live results status">
          <p>{data.notice || "Live standings can change while submitted scores are being verified."}</p>
          <p>
            <span className={styles.verifiedDot} aria-hidden="true" /> Verified
            <span className={styles.provisionalDot} aria-hidden="true" /> Provisional
          </p>
        </section>

        <nav className={styles.boardNavigation} aria-label="Masters scoreboard views">
          {BOARD_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={view === option.id ? styles.activeBoardButton : styles.boardButton}
              onClick={() => setView(option.id)}
              aria-pressed={view === option.id}
            >
              <span className={styles.fullNavLabel}>{option.label}</span>
              <span className={styles.shortNavLabel}>{option.shortLabel}</span>
            </button>
          ))}
        </nav>

        {view === "overall" ? (
          <OverallBoard rows={orderedRows} onSelectPlayer={setSelectedPlayerId} />
        ) : (
          <RoundPairBoard view={view} rows={orderedRows} onSelectPlayer={setSelectedPlayerId} />
        )}

        <footer className={styles.boardFooter}>
          <p>All registered Masters players remain visible. An em dash means that round has not been recorded.</p>
          <Link href={`/majors/${slug}/stats`}>View Bonus / Live Stats →</Link>
        </footer>
      </div>

      {selectedRow ? (
        <PlayerDetail
          row={selectedRow}
          cards={selectedCards}
          onClose={() => setSelectedPlayerId(null)}
        />
      ) : null}
    </main>
  )
}

function PlayerButton({ row, onSelect }: { row: MastersLiveRow; onSelect: (playerId: string) => void }) {
  return (
    <button type="button" className={styles.playerButton} onClick={() => onSelect(row.playerId)}>
      <span>{row.name}</span>
      {row.provisional ? <span className={styles.rowStatus} title="One or more scores await verification">PROV.</span> : null}
    </button>
  )
}

function ScoreValue({ value, status }: { value: number | null; status?: MajorPlayerScorecard["status"] | null }) {
  const provisional = value !== null && status !== null && status !== "verified"
  return (
    <span className={provisional ? styles.provisionalScore : styles.scoreValue}>
      {formatMastersLiveScore(value)}
      <span className={styles.screenReaderOnly}>{provisional ? " provisional" : ""}</span>
    </span>
  )
}

function RoundPairBoard({
  view,
  rows,
  onSelectPlayer,
}: {
  view: Exclude<MastersBoardView, "overall">
  rows: MastersLiveRow[]
  onSelectPlayer: (playerId: string) => void
}) {
  const easy = view === "easy"
  const firstRound: MastersRoundNumber = easy ? 1 : 3
  const secondRound: MastersRoundNumber = easy ? 2 : 4

  return (
    <section className={styles.scoreboard} aria-labelledby={`${view}-board-title`}>
      <div className={styles.boardHeading}>
        <div>
          <p>{easy ? "CHERRY BLOSSOM · EASY" : "CHERRY BLOSSOM · HARD"}</p>
          <h2 id={`${view}-board-title`}>{easy ? "ROUNDS 1 & 2" : "ROUNDS 3 & 4"}</h2>
        </div>
        <span>{rows.length} PLAYERS</span>
      </div>

      <div className={styles.tableScroll} data-scoreboard-scroll>
        <table className={styles.leaderboardTable}>
          <thead>
            <tr>
              <th scope="col">PLAYER</th>
              <th scope="col">ROUND {firstRound}</th>
              <th scope="col">ROUND {secondRound}</th>
              <th scope="col">{easy ? "EASY TOTAL" : "HARD TOTAL"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const pairTotal = easy ? row.easyTotal : row.hardTotal
              const pairIsProvisional = [row.rounds[firstRound], row.rounds[secondRound]]
                .some((round) => round.toPar !== null && round.status !== "verified")
              return (
                <tr key={row.entryId}>
                  <th scope="row"><PlayerButton row={row} onSelect={onSelectPlayer} /></th>
                  <td><ScoreValue value={row.rounds[firstRound].toPar} status={row.rounds[firstRound].status} /></td>
                  <td><ScoreValue value={row.rounds[secondRound].toPar} status={row.rounds[secondRound].status} /></td>
                  <td className={styles.totalCell}>
                    <ScoreValue value={pairTotal} status={pairTotal === null ? null : pairIsProvisional ? "submitted" : "verified"} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function OverallBoard({ rows, onSelectPlayer }: { rows: MastersLiveRow[]; onSelectPlayer: (playerId: string) => void }) {
  return (
    <section className={styles.scoreboard} aria-labelledby="overall-board-title">
      <div className={styles.boardHeading}>
        <div>
          <p>THE MINI-GOLF MASTERS</p>
          <h2 id="overall-board-title">OVERALL MASTERS</h2>
        </div>
        <span>{rows.length} PLAYERS</span>
      </div>

      <div className={styles.tableScroll} data-scoreboard-scroll>
        <table className={`${styles.leaderboardTable} ${styles.overallTable}`}>
          <thead>
            <tr>
              <th scope="col">PLACE</th>
              <th scope="col">PLAYER</th>
              <th scope="col">OVERALL TO PAR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.entryId}>
                <td className={styles.placeCell}>{row.overallPlace ?? "—"}</td>
                <th scope="row"><PlayerButton row={row} onSelect={onSelectPlayer} /></th>
                <td className={styles.totalCell}>
                  <ScoreValue value={row.overallTotal} status={row.provisional ? "submitted" : "verified"} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function PlayerDetail({
  row,
  cards,
  onClose,
}: {
  row: MastersLiveRow
  cards: MajorPlayerScorecard[]
  onClose: () => void
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const priorFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    priorFocusRef.current = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      priorFocusRef.current?.focus()
    }
  }, [onClose])

  return (
    <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={styles.playerDetail} role="dialog" aria-modal="true" aria-labelledby="player-detail-title">
        <button ref={closeButtonRef} type="button" className={styles.closeButton} onClick={onClose}>
          Close
        </button>
        <p className={styles.detailEyebrow}>MASTERS PLAYER DETAIL</p>
        <h2 id="player-detail-title">{row.name}</h2>
        <div className={styles.detailSummary}>
          {([1, 2, 3, 4] as MastersRoundNumber[]).map((round) => (
            <div key={round}>
              <span>ROUND {round}</span>
              <strong>{formatMastersLiveScore(row.rounds[round].toPar)}</strong>
            </div>
          ))}
          <div className={styles.overallSummary}>
            <span>OVERALL TO PAR</span>
            <strong>{formatMastersLiveScore(row.overallTotal)}</strong>
          </div>
        </div>
        <p className={row.provisional ? styles.detailProvisional : styles.detailVerified}>
          {row.provisional ? "Live result · one or more rounds await verification" : "Verified result"}
        </p>

        <div className={styles.roundDetails}>
          {cards.toSorted((a, b) => a.day_number - b.day_number).map((card) => (
            <details key={card.id}>
              <summary>
                <span>{majorRoundDayLabel(card.day_number)}</span>
                <strong>{formatMastersLiveScore(row.rounds[card.day_number].toPar)}</strong>
              </summary>
              {card.holes.length ? (
                <div className={styles.holeGrid}>
                  {card.holes.map((hole) => (
                    <div key={hole.hole_number}>
                      <span>HOLE {hole.hole_number}</span>
                      <strong>{hole.strokes}</strong>
                      <small>Par {hole.par} · {majorHoleOutcome(hole.strokes, hole.par)}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.noHoleDetail}>Hole-by-hole detail is not available yet.</p>
              )}
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}
