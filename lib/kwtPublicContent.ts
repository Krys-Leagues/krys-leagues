export type KwtCalendarWeek = {
  id?: string
  season_number: number
  week_number: number
  start_date: string
  end_date: string
  display_order: number
  active: boolean
}

export const KWT_EXTERNAL_HOME = "https://dqvo64m7q9ujvqa-wmgt23ai.adb.us-ashburn-1.oraclecloudapps.com/ords/r/wmgt/kwt/home"
export const KWT_WEEKLY_FEATURE_ASSET = "/approved-pages/kwt-weekly-feature-approved.webp"
export const KWT_SEASON_TROPHY_BOARD_ASSET = "/approved-pages/kwt-season-14-trophy-board-approved.webp"
export const KWT_PUBLIC_MEDIA_BUCKET = "kwt-public-media"

export const SEASON_14_WEEKS: readonly KwtCalendarWeek[] = [
  { season_number: 14, week_number: 7, start_date: "2026-09-11", end_date: "2026-09-13", display_order: 7, active: true },
  { season_number: 14, week_number: 8, start_date: "2026-09-18", end_date: "2026-09-20", display_order: 8, active: true },
  { season_number: 14, week_number: 9, start_date: "2026-09-25", end_date: "2026-09-27", display_order: 9, active: true },
  { season_number: 14, week_number: 10, start_date: "2026-10-02", end_date: "2026-10-04", display_order: 10, active: true },
  { season_number: 14, week_number: 11, start_date: "2026-10-09", end_date: "2026-10-11", display_order: 11, active: true },
  { season_number: 14, week_number: 12, start_date: "2026-10-16", end_date: "2026-10-18", display_order: 12, active: true },
]

export function sortKwtCalendarWeeks(weeks: readonly KwtCalendarWeek[]) {
  return [...weeks].filter((week) => week.active).sort((left, right) => left.display_order - right.display_order || left.week_number - right.week_number)
}

export function formatKwtWeekend(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T12:00:00`)
  const end = new Date(`${endDate}T12:00:00`)
  const format = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" })
  return `${format.format(start)}–${format.format(end)}`
}
