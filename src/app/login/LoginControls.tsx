'use client'

import { useTheme } from 'next-themes'
import { useLocale } from 'next-intl'
import { usePathname } from 'next/navigation'
import { Sun, Moon, Globe } from 'lucide-react'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { LANGUAGES } from '@/i18n/config'

export function LoginControls() {
  const { theme, setTheme } = useTheme()
  const activeLocale = useLocale()
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const handleLanguageChange = (lang: string) => {
    window.location.href = `/api/locale?lang=${lang}&redirect=${encodeURIComponent(pathname)}`
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5">
        <Globe size={14} className="text-slate-400 mr-1" aria-hidden />
        {LANGUAGES.map(lang => (
          <button
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            className={cn(
              'px-2 py-1 rounded text-xs font-medium transition-colors',
              activeLocale === lang.code
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            )}
          >
            {lang.label}
          </button>
        ))}
      </div>
      <button
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        aria-label="Toggle theme"
      >
        {mounted && theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </div>
  )
}
