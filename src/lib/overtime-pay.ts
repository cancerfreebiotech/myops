// 勞基法 §24/§39 加班費分段計算。
// 倍率來源為 overtime_rates（管理員可調），以 tier_key 對應；查無時退回法定倍率。

export type OvertimeDayType = 'weekday' | 'rest_day' | 'holiday'

export const DAY_TYPES: OvertimeDayType[] = ['weekday', 'rest_day', 'holiday']

/** 法定倍率（overtime_rates 查無 tier_key 時的 fallback） */
export const STATUTORY_RATES: Record<string, number> = {
  weekday_1: 1.34, // 平日 前2小時（§24-1-1）
  weekday_2: 1.67, // 平日 第3-4小時（§24-1-2）
  rest_1: 1.34,    // 休息日 前2小時（§24-2）
  rest_2: 1.67,    // 休息日 第3-8小時
  rest_3: 2.67,    // 休息日 第9小時起
  holiday: 2.0,    // 國定假日出勤 加倍發給（§39）
}

/** 依 ot_date（YYYY-MM-DD）建議日別：週六日 → rest_day；國定假日無資料來源，由申請人手動選 */
export function suggestDayType(otDate: string): OvertimeDayType {
  const d = new Date(`${otDate}T00:00:00`)
  const dow = d.getDay()
  return dow === 0 || dow === 6 ? 'rest_day' : 'weekday'
}

/**
 * 回傳「乘好倍率的加權時數」（Σ 各段時數 × 該段倍率），呼叫端再乘時薪即為加班費。
 * @param rateOf 依 tier_key 取倍率（通常來自 overtime_rates），查無時用法定倍率
 */
export function weightedOvertimeHours(
  dayType: OvertimeDayType,
  hours: number,
  rateOf: (tierKey: string) => number | undefined = () => undefined
): number {
  const r = (k: string) => rateOf(k) ?? STATUTORY_RATES[k]
  if (hours <= 0) return 0
  if (dayType === 'holiday') return hours * r('holiday')
  if (dayType === 'rest_day') {
    const h1 = Math.min(hours, 2)
    const h2 = Math.min(Math.max(hours - 2, 0), 6)
    const h3 = Math.max(hours - 8, 0)
    return h1 * r('rest_1') + h2 * r('rest_2') + h3 * r('rest_3')
  }
  const h1 = Math.min(hours, 2)
  const h2 = Math.max(hours - 2, 0)
  return h1 * r('weekday_1') + h2 * r('weekday_2')
}
