const DISCORD_CHANNEL_URL = /^https:\/\/discord[.]com\/channels\/[0-9]+\/[0-9]+\/?$/

export function isAllowedBracketRegistrationUrl(value: string) {
  return DISCORD_CHANNEL_URL.test(value.trim())
}
