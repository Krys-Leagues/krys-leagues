import { supabase } from "@/lib/supabase"

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
    await supabase.from("activity_log").insert({
      user_type: entry.userType,
      action: entry.action,
      status: entry.status ?? "success",
      page: entry.page ?? null,
      league_type: entry.leagueType ?? null,
      division: entry.division ?? null,
      discord_id: entry.discordId ?? null,
      discord_name: entry.discordName ?? null,
      user_id: entry.userId ?? null,
      details: entry.details ?? {},
    })
  } catch (err) {
    console.error("Activity Log Failed", err)
  }
}