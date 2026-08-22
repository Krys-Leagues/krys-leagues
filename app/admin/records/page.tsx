import { AdminActionCard, AdminRecordsHero, AdminRecordsShell, RecordsIcon, adminRecordsStyles as styles } from "@/components/admin/records/AdminRecordsUI"

export default function RecordsAdminPage() {
  return <AdminRecordsShell>
    <nav className={styles.nav}><a href="/admin" className={styles.button}>← Admin home</a></nav>
    <AdminRecordsHero title="Records Control Center" description="Manage individual leaderboards, combined results, and historical All-Time imports from one focused workspace." />
    <div className={styles.actionGrid}>
      <AdminActionCard href="/admin/records/single" title="Single Course Records" description="Explore each active Easy or Hard course as its own ranked leaderboard." accent="#22d3ee" icon={<RecordsIcon kind="single" />} />
      <AdminActionCard href="/admin/records/combined" title="Combined Records" description="Review the existing Easy + Hard combined record workspace." accent="#a78bfa" icon={<RecordsIcon kind="combined" />} />
      <AdminActionCard href="/admin/records/all-time" title="Historical All-Time Import" description="Preview, identity-review, and import one approved course CSV at a time." accent="#34d399" icon={<RecordsIcon kind="import" />} />
      <AdminActionCard href="/admin" title="Admin Home" description="Return to the main Krys Leagues administration dashboard." accent="#60a5fa" icon={<RecordsIcon kind="home" />} />
    </div>
  </AdminRecordsShell>
}
