'use client'

import { useEffect } from 'react'

/**
 * Client component that syncs the user's DB language preference to the locale cookie.
 * Server Components can't set cookies, so this runs client-side on mount.
 */
export function LocaleSync({ locale }: { locale: string }) {
  useEffect(() => {
    const current = document.cookie
      .split('; ')
      .find(c => c.startsWith('locale='))
      ?.split('=')[1]

    if (current !== locale) {
      document.cookie = `locale=${locale};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`
      window.location.reload()
    }
  }, [locale])

  return null
}
