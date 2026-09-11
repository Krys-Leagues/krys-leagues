type LogEntry = {
  userType: "admin" | "member" | "system"

  action: string

  status?: "success" | "warning" | "error"

  page?: string

  leagueType?: string

  division?: string

  discordId?: string

  discordName?: string

  userId?: string

  details?: Record<string, any>
}

export async function logActivity(entry: LogEntry) {
  try {
    await fetch("/api/admin/activity-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(entry),
    })
  } catch (err) {
    console.error("Activity Log Failed", err)
  }
}
