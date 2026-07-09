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

export interface OvertimeSegment {
  dayType: OvertimeDayType
  hours: number
}

/**
 * 跨午夜加班依午夜切成兩段，各段套用當日日別（分段計薪的日別以「日曆日」為準）。
 * 起始日日別用申請單所存的 day_type（含手動選的國定假日）；跨入的隔日日別依日期
 * 自動判斷（週六日 → rest_day；隔日若為國定假日無資料來源，需人工調整）。
 * 未跨午夜（end > start）→ 原樣單段。
 */
export function splitOvertimeSegments(
  dayType: OvertimeDayType,
  otDate: string,
  startTime: string,
  endTime: string
): OvertimeSegment[] {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return (h || 0) * 60 + (m || 0)
  }
  const startMin = toMin(startTime)
  const endMin = toMin(endTime)

  if (endMin > startMin) {
    return [{ dayType, hours: (endMin - startMin) / 60 }]
  }

  // 跨午夜：午夜前段用起始日日別；午夜後段用隔日日別
  const nextDate = new Date(`${otDate}T00:00:00`)
  nextDate.setDate(nextDate.getDate() + 1)
  const y = nextDate.getFullYear()
  const mo = String(nextDate.getMonth() + 1).padStart(2, '0')
  const da = String(nextDate.getDate()).padStart(2, '0')
  const day2 = suggestDayType(`${y}-${mo}-${da}`)

  const seg1Hours = (24 * 60 - startMin) / 60
  const seg2Hours = endMin / 60
  if (day2 === dayType) return [{ dayType, hours: seg1Hours + seg2Hours }]
  return [
    { dayType, hours: seg1Hours },
    { dayType: day2, hours: seg2Hours },
  ].filter(s => s.hours > 0)
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
