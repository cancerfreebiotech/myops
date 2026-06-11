import { createTranslator } from 'next-intl'
import zhTW from '@/messages/zh-TW.json'
import en from '@/messages/en.json'
import ja from '@/messages/ja.json'

// Per-recipient locale messages for proactive Teams notifications.
// Note: createTranslator is used (instead of getTranslations({ locale })) because
// src/i18n/request.ts resolves messages from the request cookie and ignores an
// explicitly passed locale — proactive Teams messages must be in each recipient's
// own language, never the caller's cookie locale.
const TEAMS_LOCALES = { 'zh-TW': zhTW, en, ja } as const

type TeamsMessageKey = keyof (typeof zhTW)['teamsMessages']

export function teamsText(
  language: string | null | undefined,
  key: TeamsMessageKey,
  values?: Record<string, string | number | Date>,
): string {
  const locale = (language && language in TEAMS_LOCALES ? language : 'zh-TW') as keyof typeof TEAMS_LOCALES
  const t = createTranslator({ locale, messages: TEAMS_LOCALES[locale], namespace: 'teamsMessages' })
  return t(key, values)
}
