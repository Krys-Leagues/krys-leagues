import type { PublicOpenTournament } from "./public"

export type PublicRegistrationArtworkState = "closed" | "open"

export function getPublicRegistrationArtworkState(registrations: readonly PublicOpenTournament[]): PublicRegistrationArtworkState {
  return registrations.length === 0 ? "closed" : "open"
}
