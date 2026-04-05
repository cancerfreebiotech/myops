'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useLocale, useTranslations } from 'next-intl'
import {
  LayoutDashboard, FileText, Megaphone, FileSignature,
  Clock, CalendarDays, Timer, DollarSign, FolderKanban,
  Settings, MessageSquarePlus, ChevronLeft, ChevronRight,
  Users, Building2, BookOpen, AlertCircle, ClipboardList,
  SlidersHorizontal, MessageCircle, Sun, Moon, Globe, LogOut, HelpCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LANGUAGES } from '@/i18n/config'
import type { User } from '@/types'

interface SidebarProps {
  user: User
}

type NavItem = { href: string; label: string; icon: React.ElementType }

function SectionHeader({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) return <div className="my-2 mx-3 border-t border-slate-200 dark:border-slate-700" />
  return (
    <div className="px-4 pt-4 pb-1">
      <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">{label}</p>
    </div>
  )
}

function NavLink({ href, label, icon: Icon, collapsed, active }: NavItem & { collapsed: boolean; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors duration-150 min-h-[44px]',
        active
          ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-medium'
          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100'
      )}
    >
      <Icon size={20} className="shrink-0" aria-hidden="true" />
      {!collapsed && <span>{label}</span>}
    </Link>
  )
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const activeLocale = useLocale()
  const t = useTranslations('nav')
  const tAuth = useTranslations('auth')
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isAdmin = user.role === 'admin'

  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.2.2'
  const deployTimeRaw = process.env.NEXT_PUBLIC_DEPLOY_TIME ?? ''
  let deployTime = ''
  if (deployTimeRaw) {
    const utc = new Date(deployTimeRaw.replace(' ', 'T') + ':00Z')
    const taipei = new Date(utc.getTime() + 8 * 60 * 60 * 1000)
    deployTime = taipei.toISOString().slice(0, 16).replace('T', ' ')
  }

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const handleLanguageChange = async (lang: string) => {
    const supabase = createClient()
    const timeout = new Promise(resolve => setTimeout(resolve, 2000))
    await Promise.race([
      supabase.from('users').update({ language: lang }).eq('id', user.id),
      timeout,
    ])
    window.location.href = `/api/locale?lang=${lang}&redirect=${encodeURIComponent(pathname)}`
  }

  const dmsItems: NavItem[] = [
    { href: '/documents',    label: t('documents'),     icon: FileText },
    { href: '/announcements',label: t('announcements'),  icon: Megaphone },
    { href: '/contracts',    label: t('contracts'),      icon: FileSignature },
  ]

  const hrItems: NavItem[] = [
    { href: '/attendance', label: t('attendance'), icon: Clock },
    { href: '/leave',      label: t('leave'),      icon: CalendarDays },
    { href: '/overtime',   label: t('overtime'),   icon: Timer },
    { href: '/payroll',    label: t('payroll'),    icon: DollarSign },
    { href: '/projects',   label: t('projects'),   icon: FolderKanban },
  ]

  const adminItems: NavItem[] = isAdmin ? [
    { href: '/admin/users',                 label: t('adminUsers'),               icon: Users },
    { href: '/admin/departments',           label: t('adminDepartments'),         icon: Building2 },
    { href: '/admin/companies',             label: t('adminCompanies'),           icon: Building2 },
    { href: '/admin/leave-types',           label: t('adminLeaveTypes'),          icon: ClipboardList },
    { href: '/admin/leave-balances',        label: t('adminLeaveBalances'),       icon: CalendarDays },
    { href: '/admin/overtime-rates',        label: t('adminOvertimeRates'),       icon: SlidersHorizontal },
    { href: '/admin/insurance-brackets',    label: t('adminInsuranceBrackets'),   icon: ClipboardList },
    { href: '/admin/bonuses',               label: t('adminBonuses'),             icon: DollarSign },
    { href: '/admin/payroll/anomalies',     label: t('adminPayrollAnomalies'),    icon: AlertCircle },
    { href: '/admin/attendance-anomalies',  label: t('adminAttendanceAnomalies'), icon: AlertCircle },
    { href: '/admin/feedback',              label: t('adminFeedback'),            icon: MessageCircle },
    { href: '/admin/audit',                 label: t('adminAudit'),               icon: BookOpen },
    { href: '/admin/settings',              label: t('adminSettings'),            icon: Settings },
  ] : []

  return (
    <aside className={cn(
      'flex flex-col h-full bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transition-all duration-200',
      collapsed ? 'w-16' : 'w-56'
    )}>
      {/* Logo + version */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-slate-200 dark:border-slate-700">
        {!collapsed && (
          <div>
            <Link href="/" className="font-semibold text-slate-900 dark:text-slate-100 text-lg font-[Lexend] hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              myOPS
            </Link>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
              v{version}{deployTime ? ` · ${deployTime}` : ''}
            </p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? t('expand') : t('collapse')}
          className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer transition-colors duration-150"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3" aria-label="Navigation">
        <NavLink href="/" label={t('dashboard')} icon={LayoutDashboard} collapsed={collapsed} active={isActive('/')} />

        <SectionHeader label={t('dms')} collapsed={collapsed} />
        {dmsItems.map(item => (
          <NavLink key={item.href} {...item} collapsed={collapsed} active={isActive(item.href)} />
        ))}

        <SectionHeader label={t('hr')} collapsed={collapsed} />
        {hrItems.map(item => (
          <NavLink key={item.href} {...item} collapsed={collapsed} active={isActive(item.href)} />
        ))}

        <SectionHeader label={t('other')} collapsed={collapsed} />
        <NavLink href="/settings"     label={t('settings')}  icon={Settings}          collapsed={collapsed} active={isActive('/settings')} />
        <NavLink href="/feedback/new" label={t('feedback')}  icon={MessageSquarePlus} collapsed={collapsed} active={isActive('/feedback/new')} />
        <NavLink href="/help"         label={t('help')}      icon={HelpCircle}        collapsed={collapsed} active={isActive('/help')} />

        {adminItems.length > 0 && (
          <>
            <SectionHeader label={t('admin')} collapsed={collapsed} />
            {adminItems.map(item => (
              <NavLink key={item.href} {...item} collapsed={collapsed} active={isActive(item.href)} />
            ))}
          </>
        )}
      </nav>

      {/* Theme + Language toggles */}
      {!collapsed && (
        <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
          >
            {mounted && theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <div className="flex items-center gap-0.5 ml-auto">
            <Globe size={14} className="text-slate-400 mr-1" aria-hidden="true" />
            {LANGUAGES.map(lang => (
              <button
                key={lang.code}
                onClick={() => handleLanguageChange(lang.code)}
                className={cn(
                  'px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer',
                  activeLocale === lang.code
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                )}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* User info + logout */}
      {!collapsed ? (
        <div className="flex items-center border-t border-slate-200 dark:border-slate-700">
          <Link
            href="/settings"
            className="flex-1 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer block min-w-0"
          >
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">
              {user.display_name ?? user.email}
            </p>
            <p className="text-xs text-slate-400 truncate">{user.email}</p>
          </Link>
          <button
            onClick={handleLogout}
            aria-label={tAuth('logout')}
            className="p-3 text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
          >
            <LogOut size={16} />
          </button>
        </div>
      ) : (
        <div className="border-t border-slate-200 dark:border-slate-700 flex justify-center py-2">
          <button
            onClick={handleLogout}
            aria-label={tAuth('logout')}
            className="p-2 text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-md transition-colors cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <LogOut size={18} />
          </button>
        </div>
      )}
    </aside>
  )
}
