/** Get the last day of a given year/month as YYYY-MM-DD */
export function lastDayOfMonth(year: number, month: number): string {
  // month is 1-based; Date(year, month, 0) gives last day of that month
  const d = new Date(year, month, 0)
  return `${year}-${String(month).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Get today's date in Asia/Taipei as YYYY-MM-DD */
export function todayTaipei(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
}
