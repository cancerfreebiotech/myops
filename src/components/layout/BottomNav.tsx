'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useLocale, useTranslations } from 'next-intl'
import {
  LayoutDashboard, Clock, CalendarDays, FileText, MoreHorizontal,
  Timer, Megaphone, FileSignature, DollarSign, Sun, Moon, Globe, LogOut, HelpCircle, MessageSquarePlus,
  FolderKanban, Settings, ShoppingCart, ClipboardList, Receipt, CheckSquare, Package, GraduationCap, Plane, CalendarRange, FlaskConical, Target } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useSyncExternalStore } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LANGUAGES } from '@/i18n/config'
import type { FeatureFlags } from '@/lib/feature-flag-keys'

// Hydration detection: false during SSR/hydration, true on the client.
const emptySubscribe = () => () => {}
const useMounted = () => useSyncExternalStore(emptySubscribe, () => true, () => false)

interface BottomNavProps {
  userId?: string
  isAdmin?: boolean
  features?: FeatureFlags
}

export function BottomNav({ userId, isAdmin = false, features }: BottomNavProps) {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const activeLocale = useLocale()
  const t = useTranslations('nav')
  const tAuth = useTranslations('auth')
  const [moreOpen, setMoreOpen] = useState(false)
  const mounted = useMounted()

  const show = (key: keyof NonNullable<typeof features>) =>
    isAdmin || (features ? features[key] : false)

  const PRIMARY_ITEMS = [
    { href: '/', label: t('dashboard'), icon: LayoutDashboard },
    show('attendance') && { href: '/attendance', label: t('attendance'), icon: Clock },
    show('leave')      && { href: '/leave',      label: t('leave'),      icon: CalendarDays },
    show('documents')  && { href: '/documents',  label: t('documents'),  icon: FileText },
  ].filter(Boolean) as { href: string; label: string; icon: React.ElementType }[]

  // 排序與 Sidebar 一致：簽核/行事曆/日報 → HR（頻率排序）→ 文件 → 專案/採購/資產 → 其他
  const MORE_ITEMS = [
    show('approvals')     && { href: '/approvals',      label: t('approvals'),     icon: CheckSquare },
    show('calendar')      && { href: '/calendar',       label: t('calendar'),      icon: CalendarRange },
    show('daily_report')  && { href: '/daily-report',   label: t('dailyReport'),   icon: ClipboardList },
    show('overtime')      && { href: '/overtime',       label: t('overtime'),      icon: Timer },
    show('business_trip') && { href: '/business-trips', label: t('businessTrip'),  icon: Plane },
    show('expenses')      && { href: '/expenses',       label: t('expenses'),      icon: Receipt },
    show('payroll')       && { href: '/payroll',        label: t('payroll'),       icon: DollarSign },
    show('training')      && { href: '/training',       label: t('training'),      icon: GraduationCap },
    show('performance')   && { href: '/performance',    label: t('performance'),   icon: Target },
    show('announcements') && { href: '/announcements',  label: t('announcements'), icon: Megaphone },
    show('contracts')     && { href: '/contracts',      label: t('contracts'),     icon: FileSignature },
    show('projects')      && { href: '/projects',       label: t('projects'),      icon: FolderKanban },
    show('procurement')   && { href: '/procurement',    label: t('procurement'),   icon: ShoppingCart },
    show('assets')        && { href: '/assets',         label: t('assets'),        icon: Package },
    show('lab_supplies')  && { href: '/lab',            label: t('labSupplies'),   icon: FlaskConical },
    show('feedback')      && { href: '/feedback/new',   label: t('feedback'),      icon: MessageSquarePlus },
    { href: '/settings', label: t('settings'), icon: Settings },
    { href: '/help',     label: t('help'),     icon: HelpCircle },
  ].filter(Boolean) as { href: string; label: string; icon: React.ElementType }[]

  const handleLanguageChange = async (lang: string) => {
    if (userId) {
      const supabase = createClient()
      const timeout = new Promise(resolve => setTimeout(resolve, 2000))
      await Promise.race([
        Promise.resolve(supabase.from('users').update({ language: lang }).eq('id', userId)).catch(() => {}),
        timeout,
      ])
    }
    window.location.assign(`/api/locale?lang=${lang}&redirect=${encodeURIComponent(pathname)}`)
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.assign('/login')
  }

  return (
    <>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 h-14 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex items-stretch safe-area-inset-bottom">
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
        <div className="md:hidden fixed inset-0 z-50" onClick={() => setMoreOpen(false)}>
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
                      'px-2 py-1.5 rounded-md text-xs font-medium transition-colors min-h-[44px] min-w-[44px] inline-flex items-center justify-center',
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
