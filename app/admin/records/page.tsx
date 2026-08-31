import { AdminActionCard, AdminRecordsHero, AdminRecordsShell, RecordsIcon, adminRecordsStyles as styles } from "@/components/admin/records/AdminRecordsUI"

export default function RecordsAdminPage() {
  return <AdminRecordsShell>
    <nav className={styles.nav}><a href="/admin" className={styles.button}>← Admin home</a></nav>
    <AdminRecordsHero title="Records Control Center" description="Enter new All-Time scores, review history, correct source attempts, and administer Climbers from one protected workspace." />
    <div className={styles.actionGrid}>
      <AdminActionCard href="/admin/records/entry" title="Normal All-Time Entry" description="Save a Full Card or Quick Score without ever moving an existing record backward." accent="#fbbf24" icon={<RecordsIcon kind="entry" />} />
      <AdminActionCard href="/admin/records/backfill" title="Late / Backdated Submission" description="Preview and save a legitimate older submission with its authoritative original chronology." accent="#f97316" icon={<RecordsIcon kind="backfill" />} />
      <AdminActionCard href="/admin/records/history" title="Records History & Corrections" description="Review source attempts and make audited, concurrency-protected corrections or voids." accent="#fb7185" icon={<RecordsIcon kind="history" />} />
      <AdminActionCard href="/admin/records/climbers" title="Climbers" description="Review PB events, people passed, season standings, and finalization state." accent="#a3e635" icon={<RecordsIcon kind="climbers" />} />
      <AdminActionCard href="/admin/records/single" title="Single Course Records" description="Explore each active Easy or Hard course as its own ranked leaderboard." accent="#22d3ee" icon={<RecordsIcon kind="single" />} />
      <AdminActionCard href="/admin/records/combined" title="Combined Records" description="Review the existing Easy + Hard combined record workspace." accent="#a78bfa" icon={<RecordsIcon kind="combined" />} />
      <AdminActionCard href="/admin/records/all-time" title="Historical All-Time Import" description="Preview, identity-review, and import one approved course CSV at a time." accent="#34d399" icon={<RecordsIcon kind="import" />} />
      <AdminActionCard href="/admin" title="Admin Home" description="Return to the main Krys Leagues administration dashboard." accent="#60a5fa" icon={<RecordsIcon kind="home" />} />
    </div>
  </AdminRecordsShell>
}
