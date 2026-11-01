import Image from "next/image"
import type { ReactNode } from "react"
import styles from "./PublicRecordsUI.module.css"

export { styles as publicRecordsStyles }
export function PublicRecordsShell({ children }: { children: ReactNode }) { return <main className={styles.page}><div className={styles.inner}>{children}</div></main> }
export function PublicRecordsHero({ title, description }: { title: string; description: string }) { return <header className={styles.hero}><Image className={styles.logo} src="/league-media/BIG LOGO TRANSPARENT.png" alt="Krys Leagues crest" width={72} height={72} priority/><div><p className={styles.eyebrow}>Krys Leagues · All-Time Records</p><h1 className={styles.title}>{title}</h1><p className={styles.subtitle}>{description}</p></div></header> }
export function RecordsGlyph({ combined=false }: { combined?: boolean }) { return <svg aria-hidden width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{combined?<><path d="M4 6h6v6H4zM14 6h6v6h-6zM9 15h6v6H9z"/><path d="M7 12v2h10v-2M12 14v1"/></>:<><path d="M4 19V9M10 19V5M16 19v-7M3 19h16"/><circle cx="4" cy="7" r="2"/><circle cx="10" cy="3" r="2"/><circle cx="16" cy="10" r="2"/></>}</svg> }
