'use client'

import { useEffect } from 'react'
import { LOCALE_COOKIE } from '@/i18n/config'

/**
 * Syncs the user's DB language preference to the locale cookie on mount.
 */
export function LocaleSync({ locale }: { locale: string }) {
  useEffect(() => {
    const current = document.cookie
      .split('; ')
      .find(c => c.startsWith(`${LOCALE_COOKIE}=`))
      ?.split('=')[1]

    if (current !== locale) {
      document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=31536000`
      window.location.reload()
    }
  }, [locale])

  return null
}
