"use client"

import styles from "./MastersHioFireworksView.module.css"

export function MastersHioFireworksView({ celebrationKey }: { celebrationKey: number | null }) {
  return (
    <main className={styles.stage} aria-live="polite">
      {celebrationKey != null && (
        <div key={celebrationKey} className={styles.fireworks} aria-label="Hole in one celebration">
          <div className={styles.burst}>
            {Array.from({ length: 36 }, (_, index) => (
              <i key={index} style={{ "--spark": index } as React.CSSProperties} />
            ))}
          </div>
          <strong>HOLE IN ONE!</strong>
        </div>
      )}
    </main>
  )
}
