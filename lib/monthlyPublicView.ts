export type MonthlyPeriodOption = {
  year: number
  month: number
  divisions: string[]
}

export type MonthlyFilterSelection = {
  year: number | ""
  month: number | ""
  division: string
}

export const emptyMonthlySelection: MonthlyFilterSelection = { year: "", month: "", division: "" }

export function initializeMonthlySelection(periods: readonly MonthlyPeriodOption[]): MonthlyFilterSelection {
  return { year: periods[0]?.year ?? "", month: "", division: "" }
}

export function monthOptionsForYear(periods: readonly MonthlyPeriodOption[], year: number | "") {
  return Array.from(new Set(periods.filter(period => period.year === year).map(period => period.month))).sort((left, right) => left - right)
}

export function divisionOptionsForSelection(periods: readonly MonthlyPeriodOption[], selection: MonthlyFilterSelection) {
  return periods.find(period => period.year === selection.year && period.month === selection.month)?.divisions || []
}

export function resetAfterYearChange(year: number | ""): MonthlyFilterSelection {
  return { year, month: "", division: "" }
}

export function resetAfterMonthChange(selection: MonthlyFilterSelection, month: number | ""): MonthlyFilterSelection {
  return { year: selection.year, month, division: "" }
}

export function selectionForPeriod(period: MonthlyPeriodOption): MonthlyFilterSelection {
  return { year: period.year, month: period.month, division: "" }
}

export function shouldLoadMonthlyResults(selection: MonthlyFilterSelection) {
  return typeof selection.year === "number" && typeof selection.month === "number" && Boolean(selection.division)
}
