import Link from "next/link"
import styles from "./KwtAreaNav.module.css"

export type KwtAreaNavItem = {
  label: string
  description: string
  href: string
}

export function KwtAreaNav({ title, items }: { title: string; items: readonly KwtAreaNavItem[] }) {
  return (
    <nav className={styles.nav} aria-label={title}>
      <p className={styles.kicker}>{title}</p>
      <div className={styles.grid}>
        {items.map((item) => (
          <Link key={`${item.label}-${item.href}`} href={item.href} className={styles.card}>
            <span className={styles.label}>{item.label}</span>
            <span className={styles.description}>{item.description}</span>
            <span className={styles.action}>Open area →</span>
          </Link>
        ))}
      </div>
    </nav>
  )
}
