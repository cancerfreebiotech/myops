'use client'

import { useEffect } from 'react'
import { LOCALE_COOKIE } from '@/i18n/config'

/**
 * Client component that syncs the user's DB language preference to the locale cookie.
 * Uses the /api/locale endpoint to set cookie server-side.
 */
export function LocaleSync({ locale }: { locale: string }) {
  useEffect(() => {
    const current = document.cookie
      .split('; ')
      .find(c => c.startsWith(`${LOCALE_COOKIE}=`))
      ?.split('=')[1]

    if (current !== locale) {
      fetch('/api/locale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      }).then(res => {
        if (res.ok) window.location.reload()
      })
    }
  }, [locale])

  return null
}
