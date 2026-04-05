'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useLocale, useTranslations } from 'next-intl'
import {
  LayoutDashboard, Clock, CalendarDays, FileText, MoreHorizontal,
  Timer, Megaphone, FileSignature, DollarSign, Sun, Moon, Globe, LogOut, HelpCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LANGUAGES } from '@/i18n/config'

interface BottomNavProps {
  userId?: string
}

export function BottomNav({ userId }: BottomNavProps) {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const activeLocale = useLocale()
  const t = useTranslations('nav')
  const tAuth = useTranslations('auth')
  const [moreOpen, setMoreOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const PRIMARY_ITEMS = [
    { href: '/', label: t('dashboard'), icon: LayoutDashboard },
    { href: '/attendance', label: t('attendance'), icon: Clock },
    { href: '/leave', label: t('leave'), icon: CalendarDays },
    { href: '/documents', label: t('documents'), icon: FileText },
  ]

  const MORE_ITEMS = [
    { href: '/overtime', label: t('overtime'), icon: Timer },
    { href: '/announcements', label: t('announcements'), icon: Megaphone },
    { href: '/contracts', label: t('contracts'), icon: FileSignature },
    { href: '/payroll', label: t('payroll'), icon: DollarSign },
    { href: '/help', label: t('help'), icon: HelpCircle },
  ]

  const handleLanguageChange = async (lang: string) => {
    if (userId) {
      const supabase = createClient()
      await supabase.from('users').update({ language: lang }).eq('id', userId)
    }
    window.location.href = `/api/locale?lang=${lang}&redirect=${encodeURIComponent(pathname)}`
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <>
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 h-14 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex items-stretch safe-area-inset-bottom">
        {PRIMARY_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 text-xs transition-colors',
                active
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400'
              )}
            >
              <Icon size={20} />
              <span>{label}</span>
            </Link>
          )
        })}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs text-slate-500 dark:text-slate-400"
        >
          <MoreHorizontal size={20} />
          <span>{t('more')}</span>
        </button>
      </nav>

      {/* More drawer */}
      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-50" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute bottom-0 left-0 right-0 bg-white dark:bg-slate-800 rounded-t-2xl p-4 pb-8"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto mb-4" />

            {/* Navigation items */}
            <div className="grid grid-cols-4 gap-3">
              {MORE_ITEMS.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className="flex flex-col items-center gap-1 p-3 rounded-xl bg-slate-50 dark:bg-slate-700 min-h-[44px]"
                >
                  <item.icon size={24} className="text-slate-500 dark:text-slate-400" aria-hidden="true" />
                  <span className="text-xs text-slate-600 dark:text-slate-300">{item.label}</span>
                </Link>
              ))}
            </div>

            {/* Divider */}
            <div className="my-4 border-t border-slate-200 dark:border-slate-700" />

            {/* Theme + Language controls */}
            <div className="flex items-center justify-between px-1">
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors min-h-[44px]"
              >
                {mounted && theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                <span className="text-xs">{mounted && theme === 'dark' ? t('themeLight') : t('themeDark')}</span>
              </button>

              <div className="flex items-center gap-1">
                <Globe size={16} className="text-slate-400 mr-1" aria-hidden="true" />
                {LANGUAGES.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => handleLanguageChange(lang.code)}
                    className={cn(
                      'px-2 py-1.5 rounded-md text-xs font-medium transition-colors min-h-[36px]',
                      activeLocale === lang.code
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    )}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Logout */}
            <div className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-3">
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors w-full min-h-[44px]"
              >
                <LogOut size={18} />
                <span className="text-sm font-medium">{tAuth('logout')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
