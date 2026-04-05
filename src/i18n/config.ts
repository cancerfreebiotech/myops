export const LOCALE_COOKIE = 'MYOPS_LOCALE'
export const SUPPORTED_LOCALES = ['zh-TW', 'en', 'ja'] as const
export const DEFAULT_LOCALE = 'zh-TW'
export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const LANGUAGES = [
  { code: 'zh-TW' as Locale, label: '中文' },
  { code: 'en' as Locale, label: 'EN' },
  { code: 'ja' as Locale, label: '日本語' },
] as const
