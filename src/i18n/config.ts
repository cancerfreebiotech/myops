export const LOCALE_COOKIE = 'MYOPS_LOCALE'
export const SUPPORTED_LOCALES = ['zh-TW', 'en', 'ja'] as const
export const DEFAULT_LOCALE = 'zh-TW'
export type Locale = (typeof SUPPORTED_LOCALES)[number]
