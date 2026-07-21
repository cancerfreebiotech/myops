// 特休 (annual leave) seniority entitlement — company 週年制 policy.
//
// Anniversary counted from the employee's 到職日 (hire date); each completed year
// starts a new entitlement period. Days by completed years of service (per the
// company policy reported by Linda Chao — NOT verbatim 勞基法 §38; edit the tiers
// here if policy changes, no deploy-time schema change needed):
//   工作未滿 3 年            → 每年 10 天
//   滿 3 年、未滿 5 年       → 每年 14 天
//   滿 5 年、未滿 10 年      → 每年 15 天
//   滿 10 年以上            → 每年 +1 天，最高 30 天
//
// All date math is done in UTC on 'YYYY-MM-DD' strings to avoid timezone drift.

export interface SeniorityEntitlement {
  /** granted days for the anniversary period containing `asOf` */
  days: number
  /** completed full years of service at the period start */
  completedYears: number
  /** anniversary period start, inclusive, 'YYYY-MM-DD' */
  periodStart: string
  /** anniversary period end, inclusive, 'YYYY-MM-DD' */
  periodEnd: string
}

/** Days granted for a given number of completed years of service. */
export function annualLeaveDaysForYears(completedYears: number): number {
  if (completedYears < 0) return 0
  if (completedYears < 3) return 10
  if (completedYears < 5) return 14
  if (completedYears < 10) return 15
  // ≥10 years: 16 days at year 10, +1 per additional year, capped at 30 (hit at year 24).
  return Math.min(16 + (completedYears - 10), 30)
}

function ymd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * Entitlement for the anniversary period that CONTAINS `asOf`.
 * Returns null if `hireDate` is not a valid date or is in the future relative to `asOf`.
 */
export function computeAnnualLeave(hireDate: string, asOf: Date): SeniorityEntitlement | null {
  const hireMs = Date.parse(`${hireDate}T00:00:00Z`)
  if (Number.isNaN(hireMs)) return null
  const hire = new Date(hireMs)
  const hy = hire.getUTCFullYear()
  const hm = hire.getUTCMonth()
  const hd = hire.getUTCDate()

  const asOfMs = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate())
  if (asOfMs < Date.UTC(hy, hm, hd)) return null // not yet employed

  // most recent hire-anniversary on or before `asOf`
  let anniv = Date.UTC(asOf.getUTCFullYear(), hm, hd)
  if (anniv > asOfMs) anniv = Date.UTC(asOf.getUTCFullYear() - 1, hm, hd)
  if (anniv < Date.UTC(hy, hm, hd)) anniv = Date.UTC(hy, hm, hd)

  const startYear = new Date(anniv).getUTCFullYear()
  const completedYears = startYear - hy
  const periodEndMs = Date.UTC(startYear + 1, hm, hd) - 86_400_000 // next anniversary − 1 day

  return {
    days: annualLeaveDaysForYears(completedYears),
    completedYears,
    periodStart: ymd(anniv),
    periodEnd: ymd(periodEndMs),
  }
}
