/**
 * 以 Asia/Taipei 時區計算「今天」的 YYYY-MM-DD。
 * 日報以台北的一天為準 — 瀏覽器或伺服器在其他時區時，
 * new Date() 的本地日期可能差一天。
 */
export function taipeiToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date())
}

/** YYYY-MM-DD 格式檢查（API 端驗證用） */
export function isValidDateString(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))
}
