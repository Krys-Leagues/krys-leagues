export type HomeTournamentAction = {
  label: "LIVE TOURNEY SIGN-UPS" | "THE MGA OPEN — COMING SOON"
  href: string
  kind: "registration" | "masters-results"
}

export type HomeRegistrationState = {
  active: boolean
  registration_open: boolean
  registration_url: string | null
  updated_at: string | null
}

const VERIFIED_REGISTRATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export function isVerifiedOpenRegistration(
  registration: HomeRegistrationState | null | undefined,
  now = Date.now(),
) {
  if (!registration?.active || !registration.registration_open || !registration.registration_url?.trim()) return false
  if (!registration.updated_at) return false

  const updatedAt = Date.parse(registration.updated_at)
  return Number.isFinite(updatedAt)
    && updatedAt <= now
    && now - updatedAt <= VERIFIED_REGISTRATION_MAX_AGE_MS
}

export function getHomeTournamentAction(
  registrationUrl: string | null,
  mastersCompleted: boolean,
): HomeTournamentAction | null {
  if (registrationUrl) {
    return {
      label: "LIVE TOURNEY SIGN-UPS",
      href: registrationUrl,
      kind: "registration",
    }
  }

  if (mastersCompleted) {
    return {
      label: "THE MGA OPEN — COMING SOON",
      href: "/majors/masters/results",
      kind: "masters-results",
    }
  }

  return null
}
