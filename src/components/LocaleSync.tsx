'use client'

import { useEffect } from 'react'
import { LOCALE_COOKIE } from '@/i18n/config'

/**
 * Syncs the user's DB language preference to the locale cookie on mount.
 * Redirects through /api/locale to set cookie server-side.
 */
export function LocaleSync({ locale }: { locale: string }) {
  useEffect(() => {
    const current = document.cookie
      .split('; ')
      .find(c => c.startsWith(`${LOCALE_COOKIE}=`))
      ?.split('=')[1]

    if (current !== locale) {
      window.location.href = `/api/locale?lang=${locale}&redirect=${encodeURIComponent(window.location.pathname)}`
    }
  }, [locale])

  return null
}
