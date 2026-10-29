export type WaitlistError = {
  code?: string | null
  message?: string | null
}

export function isDuplicateWaitlistError(error: WaitlistError) {
  return error.code === "23505" || /already exists|duplicate|unique constraint/i.test(error.message ?? "")
}

export function waitlistSuccessMessage(leagueLabel: string) {
  return [`✅ You've been added to the ${leagueLabel} wait list!`, "Krys Leagues admins can now see your signup."]
}

export function waitlistDuplicateMessage(leagueLabel: string) {
  return `You're already on the ${leagueLabel} wait list.`
}
