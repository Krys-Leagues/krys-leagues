import styles from "./VisualBracket.module.css"

export type VisualBracketMatch = {
  id: string
  matchNumber: number
  stableKey: string
  status: string
  playerAName: string
  playerBName: string
  winnerName: string | null
  scoreLabel: string | null
  scheduledLabel: string | null
  matchCenterHref: string | null
}

export type VisualBracketRound = {
  roundNumber: number
  label: string
  deadlineLabel: string | null
  matches: VisualBracketMatch[]
}

const roundLabels: Record<number, string> = {
  1: "Round 1",
  2: "Round 2",
  3: "Quarterfinals",
  4: "Semifinals",
  5: "Final",
}

export function labelForRound(roundNumber: number, configuredName: string | null) {
  return roundLabels[roundNumber] || configuredName || `Round ${roundNumber}`
}

export default function VisualBracket({ rounds }: { rounds: VisualBracketRound[] }) {
  return (
    <div className={styles.viewport}>
      <div className={styles.grid} aria-label="Five-round visual tournament bracket">
        {rounds.map((round) => (
          <section className={styles.round} data-round={round.roundNumber} key={round.roundNumber}>
            <header className={styles.roundHeader}>
              <p>Round {round.roundNumber}</p>
              <h2>{round.label}</h2>
              {round.deadlineLabel ? <span>Deadline {round.deadlineLabel}</span> : null}
            </header>
            <div className={styles.matches}>
              {round.matches.map((match) => (
                <article className={styles.match} data-match-id={match.id} key={match.id}>
                  <div className={styles.matchHeader}>
                    <strong>{match.stableKey || `Match ${match.matchNumber}`}</strong>
                    <span className={styles.status}>{match.status.replaceAll("_", " ")}</span>
                  </div>
                  <div className={styles.playerRow}>
                    <span className={match.winnerName === match.playerAName ? styles.winner : ""}>{match.playerAName}</span>
                    <span className={styles.vs}>vs</span>
                    <span className={match.winnerName === match.playerBName ? styles.winner : ""}>{match.playerBName}</span>
                  </div>
                  {match.winnerName ? <p className={styles.result}>Winner: <strong>{match.winnerName}</strong></p> : <p className={styles.pending}>Pending advancement</p>}
                  {match.scoreLabel ? <p className={styles.score}>Result: {match.scoreLabel}</p> : null}
                  {match.scheduledLabel ? <p className={styles.schedule}>Scheduled: {match.scheduledLabel}</p> : null}
                  {match.matchCenterHref ? <a className={styles.link} href={match.matchCenterHref}>Open private Match Center</a> : <span className={styles.privateNote}>Players required before private access is available.</span>}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
