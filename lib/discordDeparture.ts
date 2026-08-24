export type DeparturePlayer = { id: string; screenName: string; discordId: string | null; status: string; isMemorial: boolean }
export type DepartureMember = { discordId: string; serverDisplayName: string | null; discordUsername: string | null }
export type DepartureResolution = { status: "resolved" | "unresolved" | "ambiguous"; player: DeparturePlayer | null; candidates: DeparturePlayer[] }

export function resolveDeparturePlayer(discordId: string, players: DeparturePlayer[]): DepartureResolution {
  const matches = players.filter((player) => player.discordId?.trim() === discordId.trim())
  return matches.length === 1 ? { status: "resolved", player: matches[0], candidates: matches }
    : { status: matches.length > 1 ? "ambiguous" : "unresolved", player: null, candidates: matches }
}

export function privateDepartureMessage(player: DeparturePlayer, member: DepartureMember) {
  return {
    visibility: "admin_only" as const,
    title: "Discord member departure requires review",
    fields: [
      { name: "Krys player", value: player.screenName },
      { name: "Last known server name", value: member.serverDisplayName || "Not available" },
      { name: "Discord account", value: `${member.discordUsername || "Unknown username"} / ${member.discordId}` },
      { name: "Current status", value: player.status },
      { name: "Memorial", value: player.isMemorial ? "Yes — permanent profile and Records exception" : "No" },
    ],
    actions: ["archive_player", "mark_inactive", "ignore"] as const,
  }
}

export function departureConfirmationDecision(input: { authorizedAdmin: boolean; action: "archive_player" | "mark_inactive" | "ignore"; currentlyGuildMember: boolean }) {
  if (!input.authorizedAdmin) return { allowed: false, result: "unauthorized" as const, message: "Only an authorized admin may change player status." }
  if (input.action === "ignore") return { allowed: true, result: "ignored" as const, message: "Departure suggestion ignored. No player status changed." }
  if (input.currentlyGuildMember) return { allowed: false, result: "rejoined" as const, message: "Archive cancelled — this player is currently a member of the server." }
  return { allowed: true, result: input.action === "archive_player" ? "archive_confirmed" as const : "inactive_confirmed" as const, message: input.action === "archive_player" ? "Archive confirmation may proceed." : "Inactive confirmation may proceed." }
}

export function reconciliationCandidates(players: DeparturePlayer[], currentGuildDiscordIds: Set<string>) {
  return players.filter((player) => player.discordId && player.status === "active" && !currentGuildDiscordIds.has(player.discordId)).sort((a, b) => a.screenName.localeCompare(b.screenName))
}
