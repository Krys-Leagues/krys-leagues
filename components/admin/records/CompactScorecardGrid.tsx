import { calculateCardTotals } from "@/lib/all-time/late-backfill-batch"
import { compareRelativeScoreToPb, formatHistoricalPb, formatPb, parseOptionalRelativeScore } from "@/lib/all-time/pb-precheck"
import styles from "./CompactScorecardGrid.module.css"

export type CompactScorecardPlayerRow = { id: string; playerId: string; holes: string[]; scoreOverride: string }
export type CompactScorecardPlayer = { id: string; screen_name: string }
export type CompactScorecardCourse = { par: number | null; hole_pars: number[] | null }

type Props = {
  rows: CompactScorecardPlayerRow[]
  players: CompactScorecardPlayer[]
  course: CompactScorecardCourse | null
  disabled: boolean
  onPlayerChange: (rowId: string, playerId: string) => void
  onRemovePlayer: (rowId: string) => void
  onHoleChange: (rowId: string, holeIndex: number, value: string) => void
  onScoreOverrideChange: (rowId: string, value: string) => void
  currentBestByPlayer: Map<string, number>
  historicalBestByPlayer: Map<string, number | null>
  pbLoading: boolean
  isBackdated: boolean
  chronologyResolved: boolean
}

const holes = Array.from({ length: 18 }, (_, index) => index)

function playerLabel(player: CompactScorecardPlayer) {
  return `${player.screen_name} · ${player.id.slice(0, 8)}`
}

function parseScore(value: string) {
  return /^\d+$/.test(value.trim()) ? Number(value) : null
}

function focusCell(playerIndex: number, holeIndex: number) {
  const nextPlayer = holeIndex >= 17 ? playerIndex + 1 : playerIndex
  const targetHole = holeIndex >= 17 ? 0 : holeIndex + 1
  document.querySelector<HTMLInputElement>(`input[data-player-index="${nextPlayer}"][data-hole-index="${targetHole}"]`)?.focus()
}

function focusPreviousCell(playerIndex: number, holeIndex: number) {
  const previousPlayer = holeIndex === 0 ? playerIndex - 1 : playerIndex
  const targetHole = holeIndex === 0 ? 17 : holeIndex - 1
  document.querySelector<HTMLInputElement>(`input[data-player-index="${previousPlayer}"][data-hole-index="${targetHole}"]`)?.focus()
}

function formatTotal(row: CompactScorecardPlayerRow, course: CompactScorecardCourse | null) {
  const strokes = row.holes.map(parseScore)
  if (strokes.some((value) => value === null) || course?.par === null || course?.par === undefined) return null
  try {
    return calculateCardTotals(strokes as number[], course.par)
  } catch {
    return null
  }
}

export function CompactScorecardGrid({ rows, players, course, disabled, onPlayerChange, onRemovePlayer, onHoleChange, onScoreOverrideChange, currentBestByPlayer, historicalBestByPlayer, pbLoading, isBackdated, chronologyResolved }: Props) {
  const playerMap = new Map(players.map((player) => [player.id, player]))
  const playerListId = "canonical-player-list"

  return <div className={styles.grid} data-scorecard-layout="compact-players-by-row">
    <div className={styles.legend}>
      <span>Players stay on rows; holes run left-to-right for fast entry.</span>
      <span>Tab: next cell · Enter: next hole</span>
    </div>
    {[0, 9].map((start) => <section className={styles.half} key={start} aria-label={start === 0 ? "Front nine" : "Back nine"}>
      <h3 className={styles.halfTitle}>{start === 0 ? "FRONT 9" : "BACK 9"}</h3>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead><tr><th scope="col" className={styles.playerHeading}>Player</th>{holes.slice(start, start + 9).map((holeIndex) => <th scope="col" key={holeIndex}>H{holeIndex + 1}</th>)}<th scope="col" className={styles.totalHeading}>Total</th></tr></thead>
          <tbody>{rows.map((row, playerIndex) => {
            const player = playerMap.get(row.playerId)
            const total = formatTotal(row, course)
            return <tr key={row.id}>
              <th scope="row" className={styles.playerCell}>
                <span className={styles.playerNumber}>P{playerIndex + 1}</span>
                <input id={`player-${row.id}`} className={styles.playerInput} list={playerListId} disabled={disabled} value={player ? playerLabel(player) : ""} onChange={(event) => { const selected = players.find((item) => playerLabel(item) === event.target.value); onPlayerChange(row.id, selected?.id ?? "") }} placeholder="Search player" aria-label={`Player ${playerIndex + 1}`} />
                {player && <div className={styles.pbBox} aria-live="polite">
                  <strong>{isBackdated ? (historicalBestByPlayer.has(player.id) ? `PB AT TIME OF SUBMISSION: ${formatHistoricalPb(historicalBestByPlayer.get(player.id) ?? null)}` : chronologyResolved ? "HISTORICAL PB PENDING FULL REPLAY PREVIEW" : "HISTORICAL PB PENDING DATE/ORDER") : pbLoading ? "PB LOOKUP PENDING" : `CURRENT ALL-TIME PB: ${formatPb(currentBestByPlayer.get(player.id) ?? null)}`}</strong>
                  {!isBackdated && currentBestByPlayer.has(player.id) && <span>NEED TO BEAT: {formatPb(currentBestByPlayer.get(player.id))}</span>}
                  <label className={styles.prescreen}>Final score (optional)
                    <input className={styles.prescreenInput} type="number" inputMode="numeric" value={row.scoreOverride} disabled={disabled} onChange={(event) => onScoreOverrideChange(row.id, event.target.value)} />
                  </label>
                  {parseOptionalRelativeScore(row.scoreOverride) !== null && (isBackdated ? (historicalBestByPlayer.has(player.id) ? <span>{compareRelativeScoreToPb(parseOptionalRelativeScore(row.scoreOverride)!, historicalBestByPlayer.get(player.id) ?? null)}</span> : <span>Historical comparison waits for protected replay preview.</span>) : pbLoading ? <span>Current comparison waits for PB lookup.</span> : <span>{compareRelativeScoreToPb(parseOptionalRelativeScore(row.scoreOverride)!, currentBestByPlayer.get(player.id) ?? null)}</span>)}
                </div>}
                {rows.length > 1 && <button type="button" className={styles.remove} disabled={disabled} onClick={() => onRemovePlayer(row.id)}>Remove</button>}
              </th>
              {holes.slice(start, start + 9).map((holeIndex) => <td key={holeIndex}><input className={styles.input} type="number" min={1} step={1} inputMode="numeric" data-player-index={playerIndex} data-hole-index={holeIndex} disabled={disabled} value={row.holes[holeIndex]} onChange={(event) => onHoleChange(row.id, holeIndex, event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === "Tab" && !event.shiftKey && holeIndex === start + 8) { event.preventDefault(); focusCell(playerIndex, holeIndex) } else if (event.key === "Tab" && event.shiftKey && holeIndex === start) { event.preventDefault(); focusPreviousCell(playerIndex, holeIndex) } }} aria-label={`${player ? player.screen_name : `Player ${playerIndex + 1}`} hole ${holeIndex + 1}`} />{course?.hole_pars?.length === 18 && <small className={styles.par}>{course.hole_pars[holeIndex]}</small>}</td>)}
              <td className={styles.totalCell}>{total ? <><strong>{total.totalStrokes}</strong><span>{total.score >= 0 ? `+${total.score}` : total.score} · HIO {total.hioCount}</span></> : <span>18 holes</span>}</td>
            </tr>
          })}</tbody>
        </table>
      </div>
    </section>)}
    <datalist id={playerListId}>{players.map((player) => <option key={player.id} value={playerLabel(player)}>{player.screen_name}</option>)}</datalist>
  </div>
}
