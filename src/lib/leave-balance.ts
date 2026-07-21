// Resolve which leave_balances row applies to a given date.
//
// A balance row is either anniversary-based (週年制 特休: period_start..period_end
// set) or calendar-year (period_start NULL, keyed by `year`). For a leave taken on
// `date` (YYYY-MM-DD) we prefer the anniversary period that CONTAINS the date; if
// none, we fall back to the calendar-year row for the date's year. This one rule
// serves 特休 auto rows (period), 特休 manual overrides (year fallback), and every
// other leave type (always year).

export interface BalanceRow {
  period_start: string | null
  period_end: string | null
  year: number
}

/** Pick the single balance row (for one user + leave type) that applies to `date`. */
export function pickBalanceForDate<T extends BalanceRow>(rows: T[], date: string): T | null {
  const inPeriod = rows.find(
    r => r.period_start != null && r.period_end != null && r.period_start <= date && date <= r.period_end
  )
  if (inPeriod) return inPeriod
  const y = Number(date.slice(0, 4))
  return rows.find(r => r.period_start == null && r.year === y) ?? null
}

/** Pick, per leave_type_id, the balance row that applies to `date`. */
export function pickBalancesForDate<T extends BalanceRow & { leave_type_id: string }>(rows: T[], date: string): T[] {
  const byType = new Map<string, T[]>()
  for (const r of rows) {
    const arr = byType.get(r.leave_type_id) ?? []
    arr.push(r)
    byType.set(r.leave_type_id, arr)
  }
  const out: T[] = []
  for (const group of byType.values()) {
    const picked = pickBalanceForDate(group, date)
    if (picked) out.push(picked)
  }
  return out
}
