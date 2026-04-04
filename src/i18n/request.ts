import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'
import { LOCALE_COOKIE, SUPPORTED_LOCALES, DEFAULT_LOCALE } from './config'
import type { Locale } from './config'

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const raw = cookieStore.get(LOCALE_COOKIE)?.value ?? ''
  const locale: Locale = (SUPPORTED_LOCALES as readonly string[]).includes(raw)
    ? (raw as Locale)
    : DEFAULT_LOCALE

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
