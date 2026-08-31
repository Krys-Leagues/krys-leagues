import Image from "next/image"
import Link from "next/link"
import type { CSSProperties, ReactNode } from "react"

import styles from "./AdminRecordsUI.module.css"

export { styles as adminRecordsStyles }

export function AdminRecordsShell({ children }: { children: ReactNode }) {
  return <main className={styles.shell}><div className={styles.inner}>{children}</div></main>
}

export function AdminRecordsHero({ title, description }: { title: string; description: string }) {
  return <header className={styles.hero}>
    <Image className={styles.logo} src="/league-media/BIG LOGO TRANSPARENT.png" alt="Krys Leagues crest" width={70} height={70} priority />
    <div><p className={styles.eyebrow}>Krys Leagues · Admin</p><h1 className={styles.title}>{title}</h1><p className={styles.subtitle}>{description}</p></div>
  </header>
}

export function AdminGlassCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`${styles.glass} ${styles.cardPadding} ${className}`}>{children}</section>
}

export function AdminActionCard({ href, title, description, accent = "#22d3ee", icon }: { href: string; title: string; description: string; accent?: string; icon: ReactNode }) {
  return <Link href={href} className={`${styles.glass} ${styles.actionCard}`} style={{ "--card-accent": accent } as CSSProperties}>
    <span className={styles.actionIcon}>{icon}</span><span className={styles.actionTitle}>{title}</span><span className={styles.actionCopy}>{description}</span><span className={styles.actionLink}>Open workspace →</span>
  </Link>
}

export function RecordsIcon({ kind }: { kind: "single" | "combined" | "import" | "home" | "entry" | "history" | "climbers" }) {
  const paths = {
    single: <><path d="M4 19V9M10 19V5M16 19v-7M3 19h16"/><circle cx="4" cy="7" r="2"/><circle cx="10" cy="3" r="2"/><circle cx="16" cy="10" r="2"/></>,
    combined: <><path d="M4 6h6v6H4zM14 6h6v6h-6zM9 15h6v6H9z"/><path d="M7 12v2h10v-2M12 14v1"/></>,
    import: <><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v3h16v-3"/></>,
    home: <><path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></>,
    entry: <><path d="M12 4v16M4 12h16"/><rect x="4" y="4" width="16" height="16" rx="2"/></>,
    history: <><path d="M4 5h16M4 12h16M4 19h16"/><circle cx="7" cy="5" r="1"/><circle cx="7" cy="12" r="1"/><circle cx="7" cy="19" r="1"/></>,
    climbers: <><path d="m4 19 5-6 3 3 8-10"/><path d="M15 6h5v5"/><path d="M4 19h16"/></>,
  }
  return <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[kind]}</svg>
}
